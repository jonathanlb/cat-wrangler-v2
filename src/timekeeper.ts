import Debug from 'debug';
import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';

const debug = Debug('rsvp:timekeeper');
const error = Debug('rsvp:timekeeper:error');

export interface DateTime {
  attend?: number,
  duration: string,
  event: number,
  hhmm: string,
  id: number,
  yyyymmdd: string
}

export interface Event {
  dateTime?: number,
  dateTimes: Array<DateTime>,
  description: string,
  id: number,
  name: string,
  venue: number
}

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

function simpleWhere(query: any): string {
  if (!query) {
    return '';
  }

  const entries = Object.entries(query);
  if (!entries.length) {
    return '';
  }

  return `WHERE ${entries.map((e) => {
    const [key, arg] = e;
    if (key === 'id' || key.endsWith('Id')) {
      return `${key}=${parseInt(arg as string, 10)}`;
    }

    return `${key} LIKE '%${q(arg as string)}%'`;
  }).
    join(' AND ')}`;
}

function q(str: string): string {
  return str.replace(/'/g, '\'\'');
}

export function validateYyyyMmDd(yyyymmdd: string): void {
  if (!yyyymmdd.match(/^[0-9]{4}[/-][0-9]{1,2}[/-][0-9]{1,2}$/)) {
    throw new Error(`yyyymmdd validation: ${yyyymmdd}`);
  }
}

export function validateHhMm(hhmm: string): void {
  if (!hhmm.match(/^[0-9]{1,2}:[0-9]{2}$/)) {
    throw new Error(`hhmm validation: ${hhmm}`);
  }
}

export function validateDuration(duration: string): void {
  if (!duration.match(/^[0-9]+m$/)) {
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
   * Set the date time for the event.
   */
  async closeEvent(eventId: number, dateTimeId: number, cachedDb?: Database):
    Promise<void> {
    let query, queryOpts;
    if (dateTimeId > 0) {
      query = 'UPDATE events SET dateTime = :dateTimeId WHERE rowid = :eventId';
      queryOpts = {
        ':dateTimeId': dateTimeId,
        ':eventId': eventId,
      };
    } else {
      query = 'UPDATE events SET dateTime = -1 WHERE rowid = :eventId';
      queryOpts = {
        ':eventId': eventId,
      };
    }
    debug('closeEvent', query, queryOpts);
    const db = cachedDb || await this.openDb();
    await db.run(query, queryOpts);
    if (!cachedDb) {
      await db.close();
    }
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
    const lastId = result.lastID || 0;
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

  /**
    * @return a promise to dateTime info.
    */
  async getDateTime(dateTimeId: number, cachedDb?: Database):
    Promise<DateTime | undefined> {
    const query = 'SELECT rowid AS id, event, yyyymmdd, hhmm, duration FROM dateTimes where id=?';
    debug('getDateTime', query);

    const db = cachedDb || await this.openDb();
    try {
      return await db.get(query, dateTimeId);
    } finally {
      if (!cachedDb) {
        await db.close();
      }
    }
  }

  /**
   * @return promise of event object description.
   * @param eventId
   * @param userIdOpt if specified, join the relevant rsvps to the
   *   associated datetimes.
   */
  async getEvent(eventId: number, userIdOpt?: number, cachedDb?: Database):
    Promise<Event | undefined> {
    const eventQuery =
      'SELECT rowid AS id, name, description, venue, dateTime FROM events WHERE id=?';
    debug('getEvent', eventQuery);

    const db = cachedDb || await this.openDb();
    try {
      const event = await db.get(eventQuery, eventId);
      if (!event) {
        return undefined;
      }

      // Put the datetimes on the event.
      let dtQuery: string;
      let dtQueryOpts: object;
      if (userIdOpt) {
        dtQuery =
          'SELECT dt.rowid AS id, dt.*, r.attend ' +
          'FROM dateTimes dt ' +
          'LEFT JOIN (SELECT * FROM rsvps WHERE participant = :userId) r ' +
          'ON dt.rowid = r.dateTime ' +
          'WHERE dt.event = :eventId';
        dtQueryOpts = {
          ':eventId': eventId,
          ':userId':  userIdOpt
        };

      } else {
        dtQuery =
          'SELECT rowid AS id, event, yyyymmdd, hhmm, duration FROM dateTimes WHERE event = :eventId';
        dtQueryOpts = {
          ':eventId': eventId
        };
      }
      debug('getEvent dt', dtQuery, dtQueryOpts);
      event.dateTimes = await db.all(dtQuery, dtQueryOpts);
      if (event.dateTime) {  // replace chosen dateTime id with the object
        event.dateTime = event.dateTimes.
          find((dt: DateTime) => dt.id === event.dateTime);
      } else {
        event.dateTime = undefined;
      }
      return event;
    } finally {
      if (!cachedDb) {
        await db.close();
      }
    }
  }

  /**
   * @param opts venue-query
   * @return promise an array of event ids.
   */
  async getEvents(opts: string, cachedDb?: Database):
    Promise<Array<number>> {
    const query = `SELECT rowid AS id FROM events ${simpleWhere(opts)}`;
    debug('getEvents', query);
    const db = cachedDb || await this.openDb();
    try {
      return db.all(query).
        then((result) => result.map((x) => x.id));
    } finally {
      if (!cachedDb) {
        await db.close();
      }
    }
  }

  async getNevers(participantId: number, sinceOpt?: string, cachedDb?: Database):
    Promise<Array<string>> {
    let since;
    if (sinceOpt) {
      since = ` AND yyyymmdd > '${sinceOpt}'`;
    } else {
      since = '';
    }

    const query = 'SELECT * FROM nevers ' +
      `WHERE participant=${participantId}${since}`;
    debug('getNevers', query);
    const db = cachedDb || await this.openDb();
    try {
      return db.all(query).
        then((result) => result.map((row) => row.yyyymmdd));
    } finally {
      if (!cachedDb) {
        await db.close();
      }
    }
  }

  /**
   * @return a promise to a map of datetimes to responses.
   */
  async getRsvps(eventId: number, userId: number, cachedDb?: Database):
    Promise<Map<number, number>> {

    const query = 'SELECT datetime, attend FROM rsvps ' +
      'WHERE event = :eventId AND participant = :userId';
    const queryOpts = {
      ':eventId': eventId,
      ':userId': userId
    };
    debug('getRsvps', eventId, userId);

    const db = cachedDb || await this.openDb();
    try {
      return db.all(query, queryOpts).
        then((result) => result.reduce(
          (accum, x) => {
            accum[x.dateTime] = x.attend; // eslint-disable-line
            return accum;
          },
          {},
        ));
    } finally {
      if (!cachedDb) {
        await db.close();
      }
    }
  }

  /**
   * @return promise to id.
   */
  async getUserId(userName: string, cachedDb?: Database): Promise<number> {
    const query = `SELECT rowid FROM participants WHERE name = '${q(userName)}'`;
    debug('getUserId', query);

    const db = cachedDb || await this.openDb();
    try {
      return db.all(query).
        then((result) => {
          if (!result.length) {
            return -1;
          }
          return result[0].rowid;
        });
    } finally {
      if (!cachedDb) {
        await db.close();
      }
    }
  }

  /**
   * @return promise to id.
   */
  async getUserIdByEmail(email: string, cachedDb?: Database): Promise<number> {
    const query = `SELECT rowid FROM participants WHERE email = '${q(email.trim())}'`;
    debug('getUserIdByEmail', query);

    const db = cachedDb || await this.openDb();
    try {
      return db.all(query).
        then((result) => {
          if (!result.length) {
            return -1;
          }
          return result[0].rowid;
        });
    } finally {
      if (!cachedDb) {
        await db.close();
      }
    }
  }

  /**
   * @return promise to info.
   */
  async getUserInfo(userId: number, cachedDb?: Database): Promise<ParticipantOptions | undefined> {
    const query = `SELECT rowid as id, name, section, organizer, email FROM participants WHERE id = ${userId}`;
    debug('getUserInfo', query);

    const db = cachedDb || await this.openDb();
    try {
      return db.all(query).
        then((result: Array<ParticipantOptions>) => {
          if (!result.length) {
            return undefined;
          }
          return result[0];
        });
    } finally {
      if (!cachedDb) {
        await db.close();
      }
    }
  }

  /**
   * @return a promise to a key-value lookup.
   */
  async getValue(userId: number, key: string, cachedDb?: Database): Promise<string | number> {
    const query = `SELECT value FROM key_value WHERE key='${q(key)}'`;
    debug('getValue', query);
    const db = cachedDb || await this.openDb();
    try {
      const [result] = await db.all(query);
      return result && result.value;
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

  async never(participantId: number, dateStr: string, cachedDb?: Database): Promise<void> {
    const ts = new Date().getTime();
    const neverQuery = 'INSERT OR IGNORE INTO nevers(' +
      'participant, yyyymmdd) VALUES' +
      `(${participantId}, '${dateStr}')`;

    const coincidentDts =
      `SELECT event, rowid as dateTime, ${participantId} AS participant, -1, ${ts} AS timestamp
        FROM dateTimes
        WHERE yyyymmdd='${dateStr}'`;
    const updateDTQuery =
      `INSERT OR REPLACE INTO rsvps(event, dateTime, participant, attend, timestamp)
        ${coincidentDts}`;

    debug('never', neverQuery);
    const db = cachedDb || await this.openDb();
    await db.run(neverQuery);
    debug('never update', updateDTQuery);
    db.run(updateDTQuery);
    if (!cachedDb) {
      await db.close();
    }
  }

  async openDb(): Promise<Database> {
    return open<sqlite3.Database, sqlite3.Statement>({
      filename: this.config.dbFilename,
      driver: sqlite3.Database
    });
  }

  /**
     * @return promise to unique response id.
     */
  async rsvp(eventId: number, participantId: number, dateTimeId: number, attend: number, cachedDb: Database):
    Promise<number> {
    const innerJoinId = '(SELECT rowid FROM rsvps WHERE ' +
      'event=:eventId AND participant=:participantId ' +
      'AND dateTime=:dateTimeId';
    const ts = new Date().getTime();
    const query = 'INSERT OR REPLACE INTO rsvps(' +
      'rowid, event, participant, dateTime, attend, timestamp) VALUES' +
      `(${innerJoinId}), :eventId, :participantId, :dateTimeId, :attend, :ts)`;
    const queryOpts = {
      ':eventId': eventId,
      ':participantId': participantId,
      ':dateTimeId': dateTimeId,
      ':attend': attend,
      ':ts': ts
    };
    debug('rsvp', query);
    const db = cachedDb || await this.openDb();
    try {
      const result = await db.run(query, queryOpts);
      const lastId = result.lastID || 0;
      return lastId;
    } finally {
      if (!cachedDb) {
        await db.close();
      }
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
