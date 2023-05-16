import Debug from 'debug';
import { Database } from 'sqlite';
import * as SqlString from 'sqlstring';
import { openDb } from './db';
import { Edit } from './descriptionarchive';

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
  editable: boolean,
  dateTime?: number,
  dateTimes: Array<DateTime>,
  description: string,
  id: number,
  name: string,
  venue: number
}

export interface ParticipantOptions {
  editor?: number, // either a venue id, or -1 for true.
  email?: string,
  id?: number,
  organizer?: number,
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

export interface VenueOptions {
  id?: number,
  name?: string,
}

export function validateYyyyMmDdOptDash(yyyymmdd: string): string {
  const m = yyyymmdd.match(/^([0-9]{4})[/-]?([0-9]{2})[/-]?([0-9]{2})$/);
  if (!m || m?.length != 4) {
    throw new Error(`yyyy-mm-dd validation: ${yyyymmdd}`);
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function validateYyyyMmDd(yyyymmdd: string): string {
  if (!yyyymmdd.match(/^[0-9]{4}[/-][0-9]{1,2}[/-][0-9]{1,2}$/)) {
    throw new Error(`yyyy-mm-dd validation: ${yyyymmdd}`);
  }
  return yyyymmdd;
}

export function validateHhMm(hhmm: string): string {
  if (!hhmm.match(/^[0-9]{1,2}:[0-9]{2}$/)) {
    throw new Error(`hh:mm validation: ${hhmm}`);
  }
  return hhmm;
}

export function validateDuration(duration: string): string {
  if (!duration.match(/^[0-9]+m$/)) {
    throw new Error(`duration validation: ${duration}`);
  }
  return duration;
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
  async closeEvent(db: Database, eventId: number, dateTimeId: number):
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
    await db.run(query, queryOpts);
  }

  /**
   * @return array of datetime, count, participant-id lists
   */
  async collectRsvps(db: Database, eventId: number, userId: number) {
    const isAdminQuery = 'SELECT organizer FROM participants WHERE rowid=?';
    debug('isAdmin', isAdminQuery, userId);
    const isAdmin = await db.all(isAdminQuery, userId);
    if (!isAdmin || !isAdmin.length || !isAdmin[0].organizer) {
      return {};
    }

    const query = 'SELECT dateTime, attend, participant FROM rsvps WHERE event=?';
    debug('detail rsvps', query, eventId);
    const response = await db.all(query, eventId);
    debug('detail raw', response);
    const result = {} as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let i = 0; i < response.length; i++) {
      const row = response[i];
      const dtId = row.dateTime.toString();
      if (!result[dtId]) {
        result[dtId] = {};
      }
      result[dtId][row.participant.toString()] = row.attend;
    }
    debug('detail result', result);
    return result;
  }

  /**
   * @return a promise to the unique new dateTime id.
   */
  async createDateTime(
    db: Database, event: number, yyyymmdd: string, hhmm: string, duration: string):
    Promise<number> {
    validateYyyyMmDd(yyyymmdd);
    validateHhMm(hhmm);
    validateDuration(duration);
    const ts = new Date().getTime();
    const query =
      'INSERT INTO dateTimes(event, yyyymmdd, hhmm, duration) VALUES(:event, :yyyymmdd, :hhmm, :duration)';
    debug('createDateTime', query, event, yyyymmdd, hhmm, duration);
    const result = await db.run(query, {
      ':event': event,
      ':yyyymmdd': yyyymmdd,
      ':hhmm': hhmm,
      ':duration': duration
    });
    const dateTimeId = result.lastID || 0;
    if (dateTimeId <= 0) {
      throw new Error(`Unchecked error createDateTime: ${query} :${yyyymmdd} :${hhmm} :${duration}`);
    }

    // RSVP negative for never dates
    const neverQuery =
      'INSERT INTO rsvps(event, participant, dateTime, attend, timestamp) ' +
            `SELECT ${event}, nevers.participant, ${dateTimeId}, -1, ${ts} ` +
            'FROM nevers WHERE yyyymmdd=?';
            debug('createDateTime never', neverQuery, yyyymmdd);
    await db.run(neverQuery, yyyymmdd);

    return dateTimeId;
  }

  /**
   * @return a promise to the unique new event id.
   */
  async createEvent(db: Database, name: string, venue: number, description: string):
    Promise<number> {
    const query =
      'INSERT INTO events(name, venue, description) VALUES(:name, :venue, :description)';
    debug('createEvent', query, name, venue, description);
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
  }

  /**
   * @return a promise to the unique new participant id.
   */
  async createParticipant(db: Database, name: string, opts?: ParticipantOptions):
    Promise<number> {
    const query = opts ?.id ?
      'INSERT INTO participants(rowid, name, editor, organizer, section, email) VALUES(:rowid, :name, :editor, :organizer, :section, :email)' :
      'INSERT INTO participants(name, editor, organizer, section, email) VALUES(:name, :editor, :organizer, :section, :email)';
    const section = opts ?.section || '';
    const organizer = opts ?.organizer || 0;
    const editor = opts ?.editor || 0;
    const email = opts ?.email || '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryValues: any = {
      ':name': name,
      ':editor': editor,
      ':organizer': organizer,
      ':section': section,
      ':email': email
    };
    if (opts ?.id) {
      queryValues[':rowid'] = opts ?.id;
    }
    debug('createParticipant', query)
    const result = await db.run(query, queryValues);
    const lastId = result.lastID || 0;
    if (lastId <= 0) {
      throw new Error(`Unchecked error createParticipant: ${query} :${name} :${opts}`);
    }
    return lastId;
  }

  /**
   * @return a promise to the unique new venue id.
   */
  async createVenue(db: Database, name: string, address: string):
    Promise<number> {
    const query =
      'INSERT INTO venues(name, address) VALUES(:name, :address)';
    debug('createVenue', query, name, address);
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
        const venue = await this.getVenueByName(db, name) as Venue;
        if (venue ?.address === address) {
          return venue.id;
        } else {
          const msg = `createVenue cannot update address from "${venue ?.address}" to "${address}"`;
          throw new Error(msg);
        }
      } else {
        throw err;
      }
    }
  }

  async editEvent(db: Database, edit: Edit): Promise<boolean> {
    let query = 'SELECT editor FROM participants WHERE rowid = ?';
    debug('editEvent', query);
    const { editor } = await db.get(query, edit.author);
    if (editor === 0) {
      error('editEvent user, event, editor:', edit.author, edit.event, editor);
      return false;
    } else if (editor > 0) {
      query = 'SELECT venue FROM events WHERE rowid = ?';
      debug('editEvent', query);
      const { venue } = await db.get(query, edit.event);
      if (editor !== venue) {
        error('editEvent user, event, editor:', edit.author, edit.event, editor);
        return false;
      }
    }

    query = 'UPDATE events SET description = ? WHERE rowid = ?';
    debug('editEvent', query);
    await db.run(query, edit.description, edit.event);
    return true;
  }

  /**
    * @return a promise to dateTime info.
    */
  async getDateTime(db: Database, dateTimeId: number):
    Promise<DateTime | undefined> {
    const query = 'SELECT rowid AS id, event, yyyymmdd, hhmm, duration FROM dateTimes where id=?';
    debug('getDateTime', query, dateTimeId);

    return await db.get(query, dateTimeId);
  }

  /**
   * @return promise of event object description.
   * @param eventId
   * @param userIdOpt if specified, join the relevant rsvps to the
   *   associated datetimes.
   */
  async getEvent(db: Database, eventId: number, userIdOpt?: number):
    Promise<Event | undefined> {
    const eventQuery =
      'SELECT rowid AS id, name, description, venue, dateTime FROM events WHERE id=?';
    debug('getEvent', eventQuery);

    const event = await db.get(eventQuery, eventId);
    if (!event) {
      return undefined;
    }

    // Put the datetimes on the event.
    let dtQuery: string;
    let dtQueryOpts: object;
    let editable = false;

    if (userIdOpt) {
      const permissionsQuery = 'SELECT editor FROM participants WHERE rowid = ?';
      debug('getEvent permissions', permissionsQuery);
      const { editor = 0 } = await db.get(permissionsQuery, userIdOpt) || {};
      editable = editor < 0 || editor === event.venue;

      dtQuery =
        'SELECT dt.rowid AS id, dt.*, r.attend ' +
        'FROM dateTimes dt ' +
        'LEFT JOIN (SELECT * FROM rsvps WHERE participant = :userId) r ' +
        'ON dt.rowid = r.dateTime ' +
        'WHERE dt.event = :eventId';
      dtQueryOpts = {
        ':eventId': eventId,
        ':userId': userIdOpt
      };
    } else {
      dtQuery =
        'SELECT rowid AS id, event, yyyymmdd, hhmm, duration FROM dateTimes WHERE event = :eventId';
      dtQueryOpts = {
        ':eventId': eventId
      };
    }
    event.editable = editable;
    debug('getEvent dt', dtQuery, dtQueryOpts);
    event.dateTimes = await db.all(dtQuery, dtQueryOpts);
    if (event.dateTimes) {
      // cover up null results if participant hasn't rsvpd.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event.dateTimes.forEach((dt: any) => {
        if (null === dt.attend) dt.attend = 0 
      });
    }
    if (event.dateTime) {  // replace chosen dateTime id with the object
      event.dateTime = event.dateTimes.
        find((dt: DateTime) => dt.id === event.dateTime);
    } else {
      event.dateTime = undefined;
    }
    return event;
  }

  /**
   * @return promise an array of event ids.
   */
  async getEvents(db: Database):
    Promise<Array<number>> {
    const query = 'SELECT rowid AS id FROM events';
    debug('getEvents', query);
    return db.all(query).
      then((result) => result.map((x) => x.id));
  }

  /**
   * @return promise an array of event ids with possible dateTimes at least (inclusive) yyyymmdd.
   */
  async getEventsAfter(db: Database, yyyymmdd: string):
    Promise<Array<number>> {
    const query = 'SELECT DISTINCT events.rowid AS id FROM events, dateTimes WHERE dateTimes.yyyymmdd >= ? AND dateTimes.event = events.rowid';
    debug('getEvents', query, yyyymmdd);
    return db.all(query, yyyymmdd).
      then((result) => result.map((x) => x.id));
  }

  async getNevers(db: Database, participantId: number, sinceOpt?: string):
    Promise<Array<string>> {
    let since;
    if (sinceOpt) {
      since = ` AND yyyymmdd > '${sinceOpt}'`;
    } else {
      since = '';
    }

    const query = SqlString.format('SELECT * FROM nevers ' +
      `WHERE participant=${participantId}${since}`);
    debug('getNevers', query);
    return db.all(query).
      then((result) => result.map((row) => row.yyyymmdd));
  }

  /**
   * @return a promise to a map of datetimes to responses.
   */
  async getRsvps(db: Database, eventId: number, userId: number):
    Promise<Map<number, number>> {

    const query = 'SELECT datetime, attend FROM rsvps ' +
      'WHERE event = :eventId AND participant = :userId';
    const queryOpts = {
      ':eventId': eventId,
      ':userId': userId
    };
    debug('getRsvps', eventId, userId);

    return db.all(query, queryOpts).
      then((result) => result.reduce(
        (accum, x) => {
          accum[x.dateTime] = x.attend; // eslint-disable-line
          return accum;
        },
        {},
      ));
  }

  /**
   * @return promise to id.
   */
  async getUserId(db: Database, userName: string): Promise<number> {
    const query = 'SELECT rowid FROM participants WHERE name = ?';
    debug('getUserId', query);
    const result = await db.get(query, userName);
    if (!result) {
      return -1;
    } else {
      return result.rowid;
    }
  }

  /**
   * @return promise to id.
   */
  async getUserIdByEmail(db: Database, email: string): Promise<number> {
    const query = SqlString.format('SELECT rowid FROM participants WHERE email = ? COLLATE NOCASE', [email.trim()]);
    debug('getUserIdByEmail', query);
    const result = await db.get(query);
    if (!result) {
      return -1;
    } else {
      return result.rowid;
    }
  }

  /**
   * @return promise to info.
   */
  async getUserInfo(db: Database, userId: number): Promise<ParticipantOptions | undefined> {
    const query = 'SELECT rowid as id, name, section, organizer, email, editor FROM participants WHERE id = ?';
    debug('getUserInfo', query, userId);
    return await db.get(query, userId);
  }

  /**
   * @return a promise to a key-value lookup.
   */
  async getValue(db: Database, key: string): Promise<string | number> {
    const query = SqlString.format(
      'SELECT value FROM key_value WHERE key = ?', [key]);
    debug('getValue', query, key);
    const [result] = await db.all(query);
    return result && result.value;
  }

  async getVenueByName(db: Database, name: string): Promise<Venue | undefined> {
    const query = SqlString.format(
      'SELECT rowid, address FROM venues WHERE name=?', [name]);
    debug('getVenueByName', query);
    const result = await db.get(query);
    if (result) {
      return {
        id: result.rowid,
        name: name,
        address: result.address
      };
    }
  }

  async getVenues(db: Database, queryOpts: VenueOptions): Promise<Array<Venue>> {
    let query =  'SELECT rowid AS id, * FROM venues';
    if (queryOpts.id) {
      query = `SELECT rowid AS id, * FROM venues WHERE rowid=${queryOpts.id}`;
    }
    return db.all(query);
  }

  async never(db: Database, participantId: number, dateStr: string): Promise<void> {
    const ts = new Date().getTime();
    const neverQuery = SqlString.format(
      'INSERT OR IGNORE INTO nevers(' +
      'participant, yyyymmdd) VALUES' +
      `(${participantId}, '${dateStr}')`);

    const coincidentDts = SqlString.format(
      `SELECT event, rowid as dateTime, ${participantId} AS participant, -1, ${ts} AS timestamp
        FROM dateTimes
        WHERE yyyymmdd=?`,
      [dateStr]);
    const updateDTQuery =
      `INSERT OR REPLACE INTO rsvps(event, dateTime, participant, attend, timestamp)
        ${coincidentDts}`;

    debug('never', neverQuery);
    await db.run(neverQuery);
    debug('never update', updateDTQuery);
    db.run(updateDTQuery);
  }

  async openDb(): Promise<Database> {
    return openDb(this.config.dbFilename);
  }

  /**
     * @return promise to unique response id.
     */
  async rsvp(db: Database, eventId: number, participantId: number, dateTimeId: number, attend: number):
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
    const result = await db.run(query, queryOpts);
    const lastId = result.lastID || 0;
    return lastId;
  }

  /**
   * Set the possible datetimes of an event to one option.
   * WARNING: the method does not validate the ids of the event or datetime.
   */
  async setDateTime(db: Database, eventId: number, dateTimeId: number):
    Promise<void> {
    const query = 'UPDATE events SET dateTime = ? WHERE rowid = ?';
    await db.run(query, dateTimeId, eventId);
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
      'section TEXT, organizer INT DEFAULT 0, email TEXT, editor INT DEFAULT 0)',
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
      'CREATE TABLE IF NOT EXISTS rideshares (event INT NOT NULL, ' +
      'participant INT NOT NULL, provideSeats INT, neighborhood TEXT, UNIQUE(event, participant))'
    ];

    const db = await this.openDb();
    statements.forEach(async (s: string) => {
      debug(s);
      await db.exec(s);
    });
    return db;
  }

  /**
   * Return a map of datetime ids to response to counts.
   * Set the default response to 0 if idOpt is set.
   */
  async summarizeRsvps(db: Database, eventId: number, idOpt: number) {
    if (idOpt > 0) {
      const ts = new Date().getTime();
      const innerJoin =
        `SELECT rowid AS dateTime, ${eventId} AS event,
          ${idOpt} AS participant, 0 AS attend, ${ts} AS timestamp
          FROM dateTimes WHERE event=${eventId}`;
      const setDefault =
        `INSERT OR IGNORE INTO rsvps
          (dateTime, event, participant, attend, timestamp)
          ${innerJoin}`;
      debug('summarize, set defaults', setDefault);
      await db.all(setDefault);
    }

    const query = 'SELECT dateTime, attend, COUNT(rowid) AS count FROM rsvps ' +
      `WHERE event=${eventId} GROUP BY dateTime, attend`;
    debug('summarize rsvps', query);
    const response = await db.all(query);
    const result = {} as any;  // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let i = 0; i < response.length; i++) {
      const row = response[i] as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const dtId = row.dateTime.toString();
      if (!result[dtId]) {
        result[dtId] = {};
      }
      result[dtId][row.attend.toString()] = row.count;
    }
    return result;
  }

  async updateUserSection(db: Database, userId: number, newSection: string): Promise<string> {
    const lcSection = newSection.toLowerCase();
    const getSectionsQuery = 'SELECT name FROM sections';
    debug('updateUserSection', getSectionsQuery);
    const sections = await db.all(getSectionsQuery);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (sections && sections.find((x: any) => x.name === lcSection)) {
      const updateQuery = 'UPDATE participants SET section=? WHERE rowid=?';
      debug('updateUserSection', updateQuery);
      await db.exec(updateQuery, [lcSection, userId]);
      return lcSection;
    }
    const info = await this.getUserInfo(db, userId);
    return info ?.section || '';
  }
}
