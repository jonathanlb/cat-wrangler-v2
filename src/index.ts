import CognitoExpress from 'cognito-express';
import Debug from 'debug';
import express from 'express';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import helmet from 'helmet';
import https from 'https';
import rateLimit from 'express-rate-limit';
import tls from 'tls';

import { Request as ExReq, Response as ExRes } from 'express';

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

useCors(app);
if (getEnv('NO_AUTH')) {
  useCognito(app);
}
app.use('/', router);

// TODO: configure routes here
router.get('/', (req, res) => {
  debug('/ request', req.url);
  res.send('Hello!');
});

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

        debug('validating', accessTokenFromClient);
        cognito.validate(
          accessTokenFromClient,
          function (err: Error, response: Response) {
            if (err) return res.status(401).send(err);
            else next();
          });
      }
    });
  } else {
    debug('missing Cognito config, check env variables');
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
