import Debug from 'debug';
import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';

const debug = Debug('rsvp:timekeeper');
const error = Debug('rsvp:timekeeper:error');

export interface ParticipantOptions {
  email?: string,
  id?: number,
  organizer?: boolean,
  section?: string,
}

export interface TimeKeeperOpts {
  dbFilename: string
}

export interface Venue {
  id: number,
  name: string,
  address: string
}

export function validateYyyyMmDd(yyyymmdd: string): void {
  if (!yyyymmdd?.match(/^[0-9]{4}[/-][0-9]{1,2}[/-][0-9]{1,2}$/)) {
    throw new Error(`yyyymmdd validation: ${yyyymmdd}`);
  }
}

export function validateHhMm(hhmm: string): void {
  if (!hhmm?.match(/^[0-9]{1,2}:[0-9]{2}$/)) {
    throw new Error(`hhmm validation: ${hhmm}`);
  }
}

export function validateDuration(duration: string): void {
  if (!duration?.match(/^[0-9]+m$/)) {
    throw new Error(`duration validation: ${duration}`);
  }
}

export class TimeKeeper {
  config: TimeKeeperOpts;

  constructor(opts: TimeKeeperOpts) {
    this.config = {
      dbFilename: opts.dbFilename
    };
  }

  /**
   * @return a promise to the unique new dateTime id.
   */
  async createDateTime(
    event: number, yyyymmdd: string, hhmm: string, duration: string,
    cachedDb?: Database):
    Promise<number> {
    validateYyyyMmDd(yyyymmdd);
    validateHhMm(hhmm);
    validateDuration(duration);
    const ts = new Date().getTime();
    const query =
      'INSERT INTO dateTimes(event, yyyymmdd, hhmm, duration) VALUES(:event, :yyyymmdd, :hhmm, :duration)';
    debug('createDateTime', query, event, yyyymmdd, hhmm, duration);
    const db = cachedDb || await this.openDb();
    const result = await db.run(query, {
      ':event': event,
      ':yyyymmdd': yyyymmdd,
      ':hhmm': hhmm,
      ':duration': duration
    });
    const lastId = await result.lastID || 0;
    if (lastId <= 0) {
      throw new Error(`Unchecked error createDateTime: ${query} :${yyyymmdd} :${hhmm} :${duration}`);
    }
    if (!cachedDb) {
      db.close();
    }
    return lastId;
  }

  /**
   * @return a promise to the unique new event id.
   */
  async createEvent(name: string, venue: number, description: string, cachedDb?: Database):
    Promise<number> {
    const query =
      'INSERT INTO events(name, venue, description) VALUES(:name, :venue, :description)';
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
  }

  /**
   * @return a promise to the unique new participant id.
   */
  async createParticipant(name: string, opts?: ParticipantOptions, cachedDb?: Database):
    Promise<number> {
    const query = opts ?.id ?
      'INSERT INTO participants(rowid, name, organizer, section, email) VALUES(:rowid, :name, :organizer, :section, :email)' :
      'INSERT INTO participants(name, organizer, section, email) VALUES(:name, :organizer, :section, :email)';
    const section = opts ?.section || '';
    const organizer = opts ?.organizer || false;
    const email = opts ?.email || '';
    const queryValues: any = {
      ':name': name,
      ':organizer': organizer,
      ':section': section,
      ':email': email
    };
    if (opts ?.id) {
      queryValues[':rowid'] = opts ?.id;
    }
    debug('createParticipant', query)
    const db = cachedDb || await this.openDb();
    try {
      const result = await db.run(query, queryValues);
      const lastId = result.lastID || 0;
      if (lastId <= 0) {
        throw new Error(`Unchecked error createParticipant: ${query} :${name} :${opts}`);
      }
      return lastId;
    } finally {
      if (!cachedDb) {
        await db.close();
      }
    }
  }

  /**
   * @return a promise to the unique new venue id.
   */
  async createVenue(name: string, address: string, cachedDb?: Database):
    Promise<number> {
    const query =
      'INSERT INTO venues(name, address) VALUES(:name, :address)';
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
      const err = _err as Error;
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

  async openDb(): Promise<Database> {
    return open<sqlite3.Database, sqlite3.Statement>({
      filename: this.config.dbFilename,
      driver: sqlite3.Database
    });
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
