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

// XXX TODO check userId for event detail access
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
      '/datetime/get/:dateTimeId',
      async (req: express.Request, res: express.Response) => {
        this.openDb(async (db: Database) => {
          try {
            const userId = parseInt(req.headers['x-userid'] as string, 10);
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

  setupEventGet(): Server {
    this.router.get(
      '/event/list',
      async (req: express.Request, res: express.Response) => {
        debug('event/list request', req.headers['x-email']);
        this.openDb(async (db: Database) => {
          try {
            const result = await this.timekeeper.getEvents(db);
            res.status(200).send(JSON.stringify(result));
          } catch (err) {
            errors('event list', err);
            res.status(500).send('event list error');
          }
        });
      });

    this.router.get(
      '/event/get/:eventId', // XXX duplicate name, request detail here
      async (req: express.Request, res: express.Response) => {
        this.openDb(async (db: Database) => {
          try {
            const userId = parseInt(req.headers['x-userid'] as string, 10);
            const eventId = parseInt(req.params.eventId, 10);
            const result = await this.timekeeper.getEvent(db, eventId, userId);
            res.status(200).send(JSON.stringify(result));
          } catch (err) {
            errors('event get', err);
            res.status(500).send('event list error');
          }
        });
      });

    this.router.get(
      '/event/get/:eventId', // XXX duplicate name, no detail here
      async (req: express.Request, res: express.Response) => {
        this.openDb(async (db: Database) => {
          try {
            const eventId = parseInt(req.params.eventId, 10);
            const result = await this.timekeeper.getEvent(db, eventId);
            res.status(200).send(JSON.stringify(result));
          } catch (err) {
            errors('event get', err);
            res.status(500).send('event list error');
          }
        });
      });

    // TODO ? allow query?

    return this;
  }

  setupEventSummary(): Server {
    this.router.get(
      '/event/summary/:eventId',
      async (req: express.Request, res: express.Response) => {
        this.openDb(async (db: Database) => {
          try {
            const userId = parseInt(req.headers['x-userid'] as string, 10);
            const eventId = parseInt(req.params.eventId, 10);
            const rsvps = await this.timekeeper.summarizeRsvps(
              db, eventId, userId);
            res.status(200).send(JSON.stringify(rsvps));
          } catch (err) {
            errors('event detail', err);
            res.status(500).send('event detail error');
          }
        });
      });


    this.router.get(
      '/event/detail/:eventId',
      async (req: express.Request, res: express.Response) => {
        this.openDb(async (db: Database) => {
          try {
            const userId = parseInt(req.headers['x-userid'] as string, 10);
            const eventId = parseInt(req.params.eventId, 10);
            const rsvps = await this.timekeeper.collectRsvps(
              db, eventId, userId);
            res.status(200).send(JSON.stringify(rsvps));
          } catch (err) {
            errors('event detail', err);
            res.status(500).send('event detail error');
          }
        });
      });

    return this;
  }

  setupKeyRetrieval(): Server {
    this.router.get(
      '/key/:key',
      async (req: express.Request, res: express.Response) => {
        this.openDb(async (db: Database) => {
          try {
            const { key } = req.params;
            const value = await this.timekeeper.getValue(db, key);
            if (value !== undefined) {
              res.status(200).send(value);
            } else {
              res.status(404).send(`not found: ${key}`);
            }
          } catch (err) {
            errors('get key', err);
            res.status(500).send('get key error');
          }
        });
      });

      return this;
  }

  setupNevers(): Server {
    this.router.get(
      '/event/never/:dateStr',
      async (req: express.Request, res: express.Response) => {
        this.openDb(async (db: Database) => {
          try {
            const { dateStr } = req.params;
            const userId = parseInt(req.headers['x-userid'] as string, 10);
            debug('never', userId, dateStr);
            await this.timekeeper.never(db, userId, dateStr);
            res.status(200).send('OK');
          } catch (err) {
            errors('set nevers', err);
            res.status(500).send('set nevers error');
          }
        });
      });

      this.router.get(
        '/event/never',
        async (req: express.Request, res: express.Response) => {
          this.openDb(async (db: Database) => {
            try {
              const userId = parseInt(req.headers['x-userid'] as string, 10);
              const todayStr = new Date().toISOString().split('T')[0];
              debug('nevers', userId, todayStr);
              const nevers = await this.timekeeper.getNevers(
                db, userId, todayStr);
              res.status(200).send(JSON.stringify(nevers));
            } catch (err) {
              errors('get nevers', err);
              res.status(500).send('get nevers error');
            }
          });
        });

    return this;
  }

  setupRsvp(): Server {
    this.router.get(
      '/event/rsvp/:eventId/:dateTimeId/:rsvp', // XXX do we need eventId?
      async (req: express.Request, res: express.Response) => {
        this.openDb(async (db: Database) => {
          try {
            const userId = parseInt(req.headers['x-userid'] as string, 10);
            const eventId = parseInt(req.params.eventId, 10);
            const dateTimeId = parseInt(req.params.dateTimeId, 10);
            const rsvp = parseInt(req.params.rsvp, 10);
            debug('rsvp', userId, eventId, dateTimeId, rsvp);
            await this.timekeeper.rsvp(
              db, eventId, userId, dateTimeId, rsvp);
              res.status(200).send('OK');
          } catch (err) {
            errors('rsvp', err);
            res.status(500).send('rsvp error');
          } 
        })
      });

      this.router.get(
        '/event/rsvp/:eventId',
        async (req: express.Request, res: express.Response) => {
          this.openDb(async (db: Database) => {
            try {
              const userId = parseInt(req.headers['x-userid'] as string, 10);
              const eventId = parseInt(req.params.eventId, 10);
              debug('get-rsvp', userId, eventId);
              const result = await this.timekeeper.getRsvps(
                db, eventId, userId);
                res.status(200).send(JSON.stringify(result));
            } catch (err) {
              errors('get-rsvp', err);
              res.status(500).send('get-rsvp error');
            }
          });
        });
    return this;
  }

  setupUpdateSection(): Server {
    this.router.get(
      '/user/update-section/:newSection',
      async (req: express.Request, res: express.Response) => {
        this.openDb(async (db: Database) => {
          const { newSection } = req.params;
          const userId = parseInt(req.headers['x-userid'] as string, 10);
          debug('update-section', userId, newSection);
          const updatedSection = await this.timekeeper.updateUserSection(
            db, userId, newSection);
          res.status(200).send(updatedSection);
        });
      });

    return this;
  }

  setupUserGet(): Server {
    this.router.get(
      '/user/get/:userId',
      async (req: express.Request, res: express.Response) => {
        const userId = parseInt(req.params.userId, 10);
        debug('get user info', userId);
        this.openDb(async (db: Database) => {
          try {
            const info = await this.timekeeper.getUserInfo(db, userId);
            res.status(200).send(JSON.stringify(info));
          } catch (err) {
            errors('get user info', err);
            res.status(500).send('cannot lookup user info');
          }
        });
      });

    this.router.get(
      '/user/id/:name',
      async (req: express.Request, res: express.Response) => {
        this.openDb(async (db: Database) => {
          try {
            const { name } = req.params;
            debug('get user id', name);
            const id = await this.timekeeper.getUserId(db, name);
            if (id && id > 0) {
              res.status(200).send(id.toString());
            } else {
              res.status(404).send(`not found: ${name}`);
            }
          } catch (err) {
            errors('userid get', err);
            res.status(500).send('get userid failure');
          }
        });
      });


    return this;
  }

  setupVenueGet(): Server {

    this.router.get(
      '/venue/get/:venueId',
      async (req: express.Request, res: express.Response) => {
        this.openDb(async (db: Database) => {
          try {
            const venueId = parseInt(req.params.venueId, 10);
            debug('venue get', venueId);
            const result = await this.timekeeper.getVenues(
              db, { id: venueId });
            if (result && result.length) {
              res.status(200).send(JSON.stringify(result[0]));
            } else {
              res.status(404).send(`venue ${venueId} not found`);
            }
          } catch (err) {
            errors('venue get', err);
            res.status(500).send('get venue failure');
          }
        });
      });

    this.router.get(
      '/venue/list',
      async (req: express.Request, res: express.Response) => {
        this.openDb(async (db: Database) => {
          try {
            debug('venue list');
            const result = await this.timekeeper.getVenues(db, { });
            res.status(200).send(JSON.stringify(result));
          } catch (err) {
            errors('venue list', err);
            res.status(500).send('list venue failure');
          }
        });
      });

    return this;
  }
}
