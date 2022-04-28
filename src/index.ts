import CognitoExpress from 'cognito-express';
import Debug from 'debug';
import express from 'express';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';
import helmet from 'helmet';
import https from 'https';
import rateLimit from 'express-rate-limit';
import { Database } from 'sqlite';
import tls from 'tls';

import { Request as ExReq, Response as ExRes } from 'express';

import { Server } from './server';
import { TimeKeeper } from './timekeeper';

const debug = Debug('rsvp:index');

debug('reading env');
dotenv.config();

const app = express();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
});
app.use(limiter);
app.use(helmet());
app.use(express.json());

const router = express.Router();
const timekeeper = new TimeKeeper({
  dbFilename: 'data/rsvps.sqlite'
});
let db = {} as Database;
timekeeper.setup().
  then(x => db = x); // XXX need to wait for setup before serving...
const server = new Server({ 
  router,
  timekeeper
});

useCors(app);
server.setupAlive();

useCognito(app);
app.use('/', router);

server.setupDatetimeGet().
  setupEventGet().
  setupEventSummary().
  setupKeyRetrieval().
  setupNevers().
  setupUpdateSection().
  setupRsvp().
  setupUserGet().
  setupVenueGet();

const port: number = parseInt(
  getEnv('PORT', true) as string, 10);
if (port && !isNaN(port)) {
  debug('using http port', port);
  const server = app.listen(port, () => {
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

  if (region && poolId) {
    const cognito = new CognitoExpress({
      region: region,
      cognitoUserPoolId: poolId,
      tokenUse: 'id', // tag sent by front-end auth from login
      tokenExpiration: 3600000*24*90
    });

    debug('wiring cognito');
    app.use((req: ExReq, res: ExRes, next: express.NextFunction) => {
      debug('cognito request');
      if (req.method === 'OPTIONS') {
        next();
      } else {
        const accessTokenFromClient =
          req.headers['authorization']?.replace(/^[Bb]earer\s+/, '');
        if (!accessTokenFromClient) {
          return res.status(401).send('Access Token missing from header');
        }

        debug('cognito validating');
        cognito.validate(
          accessTokenFromClient,
          async function (err: Error, response: Response) {
            if (err) return res.status(401).send(err);
            else {
              const { email } = jwt.decode(accessTokenFromClient) as jwt.JwtPayload;
              // XXX TODO check expiry
              const id = await timekeeper.getUserIdByEmail(db, email);
              req.headers['x-email'] = email;
              req.headers['x-userid'] = id.toString();
              next();
            }
          });
      }
    });
  } else {
    console.warn('missing Cognito config, check env variables');
  }
}

function useCors(app: express.Application) {
  app.use((req: ExReq, res: ExRes, next: express.NextFunction) => {
    debug('cors');
    res.header('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.header('Access-Control-Allow-Headers',
               'Accept,Authorization,Content-type,Origin,X-Requested-With,X-Access-Token,X-Key');
    res.header('Access-Control-Expose-Headers', 'X-Access-Token');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    next();
  });
}
