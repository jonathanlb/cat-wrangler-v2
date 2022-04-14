import Debug from 'debug';
import * as express from 'express';
import { Database } from 'sqlite';

import { TimeKeeper } from './timekeeper';

const debug = Debug('rsvp:server');
const errors = Debug('rsvp:server:error');

export interface ServerConfig {
  router: express.Router,
  timekeeper: TimeKeeper,
}

export class Server {
  router: express.Router;
  timekeeper: TimeKeeper;

  constructor(config: ServerConfig) {
    this.router = config.router;
    this.timekeeper = config.timekeeper;
  }

  /**
   * Wrap up server-side logic in an open/finally-close.
   */
  private async openDb(f: (db: Database) => Promise<void>)  {
    const db = await this.timekeeper.openDb();
    try {
      await f(db);
    } finally {
      db.close();
    }
  }

  setupAlive(): Server {
    this.router.get(
      '/alive',
      async (req: express.Request, res: express.Response) =>
        res.status(200).send('OK'),
    );
    return this;
  }

  setupDatetimeGet(): Server {
    this.router.get(
      '/datetime/get/:userId/:dateTimeId',
      async (req: express.Request, res: express.Response) => {
        this.openDb(async (db: Database) => {
          try {
            const userId = parseInt(req.params.userId, 10);
            const dateTimeId = parseInt(req.params.dateTimeId, 10);
            debug('datetime get', userId);
            const result = await this.timekeeper.getDateTime(db, dateTimeId);
            res.status(200).send(JSON.stringify(result));
          } catch (err) {
            errors('datetime get', err);
            res.status(500).send('get datetime failure');
          }
        });
      },
    );
    return this;
  }

  setupUserGet(): Server {
    return this;
  }
}
