import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { CognitoAccessTokenPayload } from 'aws-jwt-verify/jwt-model';
import cors from 'cors';
import Debug from 'debug';
import express from 'express';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import helmet from 'helmet';
import https from 'https';
import rateLimit from 'express-rate-limit';
import { Database } from 'sqlite';
import tls from 'tls';

import { Request as ExReq, Response as ExRes } from 'express';

import { Server } from './server';
import { TimeKeeper } from './timekeeper';

const debug = Debug('rsvp:index');
const errors = Debug('rsvp:index:error');

console.log('PID=', process.pid);
debug('reading env');
dotenv.config();

const app = express();

app.use(cors()); // set up Cors ahead of rate limiter to forward error
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
});
app.use(limiter);
app.use(helmet());
app.use(express.json());

const router = express.Router();
const timekeeper = new TimeKeeper({
  dbFilename: getEnv('RSVPS_SQLITE', true) || 'data/rsvps.sqlite'
});
let db = {} as Database;
timekeeper.setup().
  then(x => db = x); // XXX need to wait for setup before serving...
const server = new Server({ 
  router,
  timekeeper
});

server.setupAlive();

useCognito(app);
app.use('/', router);

server.setupDatetimeGet().
  setupEventGet().
  setupEventSummary().
  setupKeyRetrieval().
  setupNevers().
  setupUpdateSection().
  setupRideShare().
  setupRsvp().
  setupUserGet().
  setupVenueGet();

if (getEnv('EDIT_EVENTS', true)?.toLowerCase() === 'true') {
  debug('enabling event editing');
  server.setupEventEdit();
}

const port: number = parseInt(
  getEnv('PORT', true) as string, 10);
if (port && !isNaN(port)) {
  debug('using http port', port);
  app.listen(port, () => {
    debug('serving http on port', port);
  });
}

const httpsPort: number = parseInt(
  getEnv('HTTPS_PORT', true) as string, 10);
if (httpsPort && !isNaN(httpsPort)) {
  debug('using https port', httpsPort);
  https.createServer({
        SNICallback: (servername, cb) => {
          const keyFile = getEnv('KEY_FILE') as string;
          const certFile = getEnv('CERTIFICATE_FILE') as string;
          const certAuthFile = getEnv('CA_FILE', true);

          debug(`creating secure context key=${keyFile} cert=${certFile} ca=${certAuthFile}`);
          const ctx = tls.createSecureContext({
            key: fs.readFileSync(keyFile, 'utf8'),
            cert: fs.readFileSync(certFile, 'utf8'),
            ca: certAuthFile && fs.readFileSync(certAuthFile, 'utf8'),
          });
          cb(null, ctx);
        },
      },
      app).
        listen(httpsPort, () => debug('serving https on port', httpsPort));
}



function getEnv(envVar: string, noThrow?: boolean): string | undefined {
  const envVal = process.env[envVar];
  if (envVal === undefined && !noThrow) {
    throw new Error(`Cannot read env var: ${envVar}`);
  }
  return envVal;
}

function useCognito(app: express.Application) {
  const region = getEnv('AWS_REGION', true);
  const poolId = getEnv('AWS_USER_POOL_ID', true);
  const clientId = getEnv('AWS_CLIENT_ID', true);

  if (region && poolId) {
    const verifier = CognitoJwtVerifier.create({
      userPoolId: poolId,
      tokenUse: 'id',
      clientId: clientId,
    }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    // cannot find type with single argument .verify() method...

    debug('wiring cognito');
    app.use((req: ExReq, res: ExRes, next: express.NextFunction) => {
      debug('cognito request');
      if (req.method === 'OPTIONS') {
        next();
      } else {
        const accessTokenFromClient =
          req.headers['authorization']?.replace(/^[Bb]earer\s+/, '');
        if (!accessTokenFromClient) {
          return res.status(401).send('Access Token expired');
        }

        debug('cognito validating');
        const now_s = new Date().getTime() / 1000;
        verifier.verify(accessTokenFromClient).
          then(async (payload: CognitoAccessTokenPayload) => {
            debug('payload', payload);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { email } = payload as any
            const exp = payload.exp.valueOf()
            if ((exp || 0) < now_s) {
              const err = 'expired id token';
              debug(err);
              return res.status(401).send(err);
            }
            const id = await timekeeper.getUserIdByEmail(db, email);
            if (id < 0) {
              const err = 'invalid user id';
              errors(err);
              return res.status(401).send(err);
            }
            req.headers['x-email'] = email;
            req.headers['x-userid'] = id.toString();
            next();
          }).catch((err: Error) => {
            debug('invalid JWT token', err);
            return res.status(401).send(err);
          });
      }
    });
  } else {
    console.warn('missing Cognito config, check env variables');
  }
}
