import Debug from 'debug';
import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';

const debug = Debug('rsvp:server');
const error = Debug('rsvp:server:error');

export interface ServerOpts {
  dbFilename: string
}

export interface Venue {
  id: number,
  name: string,
  address: string
}

export class Server {
  config: ServerOpts;

  constructor(opts: ServerOpts) {
    this.config = {
      dbFilename: opts.dbFilename
    };
  }

  private async openDb(): Promise<Database> {
    return open<sqlite3.Database, sqlite3.Statement>({
      filename: this.config.dbFilename,
      driver: sqlite3.Database
    });
  }

  /**
   * @return a promise to the unique new event id.
   */
  async createEvent(name: string, venue: number, description: string, cachedDb?: Database):
    Promise<number> {
    const query =
      'INSERT INTO events(name, venue, description) VALUES (:name, :venue, :description)';
    debug('createEvent', query, name, venue, description);
    const db = cachedDb || await this.openDb();
    try {
      const result = await db.run(query, {
        ':name': name,
        ':venue': venue,
        ':description': description
      });
      const lastId = result.lastID || 0;
      if (lastId <= 0) {
        throw new Error(`Unchecked error createEvent: ${query} :${name} :${venue} :${description}`);
      }
      return lastId;
    } finally {
      if (!cachedDb) {
        await db.close();
      }
    }
    return 0;
  }

  /**
   * @return a promise to the unique new venue id.
   */
  async createVenue(name: string, address: string, cachedDb?: Database):
    Promise<number> {
    const query =
      'INSERT INTO venues(name, address) VALUES (:name, :address)';
    debug('createVenue', query, name, address);
    const db = cachedDb || await this.openDb();
    try {
      const result = await db.run(query, {
        ':name': name,
        ':address': address
      });
      const lastId = result.lastID || 0;
      if (lastId <= 0) {
        throw new Error(`Unchecked error createVenue: ${query} :${name} :${address}`);
      }
      return lastId;
    } catch (_err) {
      const err: Error = _err as Error;
      if (err.message ===
        'SQLITE_CONSTRAINT: UNIQUE constraint failed: venues.name') {
        const venue = await this.getVenueByName(name, db) as Venue;
        if (venue ?.address === address) {
          return venue.id;
        } else {
          const msg = `createVenue cannot update address from "${venue ?.address}" to "${address}"`;
          throw new Error(msg);
        }
      } else {
        throw err;
      }
    } finally {
      if (!cachedDb) {
        await db.close();
      }
    }
    return 0;
  }

  async getVenueByName(name: string, cachedDb?: Database): Promise<Venue | undefined> {
    const query = 'SELECT rowid, address FROM venues WHERE name=?';
    debug('getVenueByName', query, name);
    const db = cachedDb || await this.openDb();
    const result = await db.get(query, name);
    if (!cachedDb) {
      await db.close();
    }
    if (result) {
      return {
        id: result.rowid,
        name: name,
        address: result.address
      };
    }
  }

  /**
   * Initialize the database.
   */
  async setup(): Promise<Database> {
    const statements = [
      'CREATE TABLE IF NOT EXISTS events (name TEXT UNIQUE, ' +
      'description TEXT NOT NULL, venue INT NOT NULL, dateTime INT)',
      'CREATE INDEX IF NOT EXISTS idx_event_name ON events(name)',
      'CREATE INDEX IF NOT EXISTS idx_event_venue ON events(venue)',
      'CREATE TABLE IF NOT EXISTS participants (name TEXT NOT NULL UNIQUE, ' +
      'section TEXT, organizer INT DEFAULT 0, email TEXT)',
      'CREATE INDEX IF NOT EXISTS idx_participants_name ON participants(name)',
      'CREATE TABLE IF NOT EXISTS sections (name TEXT NOT NULL UNIQUE)',
      'CREATE TABLE IF NOT EXISTS dateTimes (event INT, yyyymmdd TEXT, ' +
      'hhmm TEXT, duration TEXT)',
      'CREATE INDEX IF NOT EXISTS idx_dateTimes_event ON dateTimes(event)',
      'CREATE TABLE IF NOT EXISTS nevers (participant INT, yyyymmdd TEXT, ' +
      'UNIQUE(participant, yyyymmdd))',
      'CREATE INDEX IF NOT EXISTS idx_nevers_date ON nevers(yyyymmdd)',
      'CREATE TABLE IF NOT EXISTS venues (name TEXT UNIQUE, address TEXT)',
      'CREATE INDEX IF NOT EXISTS idx_venues_name ON venues(name)',
      'CREATE TABLE IF NOT EXISTS rsvps (event INT NOT NULL, ' +
      'participant INT NOT NULL, dateTime INT NOT NULL, attend INT DEFAULT 0, ' +
      'timestamp INT NOT NULL, UNIQUE(event, participant, dateTime))',
      'CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps(event)',
      'CREATE INDEX IF NOT EXISTS idx_rsvps_participant ON rsvps(participant)',
      'CREATE TABLE IF NOT EXISTS key_value (key TEXT UNIQUE, value TEXT)',
      'CREATE INDEX IF NOT EXISTS idx_key_value ON key_value(key)',
    ];

    const db = await this.openDb();
    statements.forEach(async (s: string) => {
      debug(s);
      await db.exec(s);
    });
    return db;
  }
}
