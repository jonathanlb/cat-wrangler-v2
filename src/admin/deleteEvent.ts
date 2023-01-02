// Delete an existing event and its corresponding dates and rsvps.
// Usage: node dist/deleteEvent <event-id> [sqlite3-file]

import Debug from 'debug';
import * as dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';


const debug = Debug('rsvp:deleteEvent');
if (process.argv.length < 3) {
  throw new Error('usage: node dist/deleteEvent.js <event-id> [db.sqlite3]');
}

debug('reading env');
dotenv.config();

const eventId = parseInt(process.argv[2]);
const dbFilename = process.argv.length > 3 ?
  process.argv[3] :
  process.env['RSVPS_SQLITE'] || 'data/rsvps.sqlite';

let db = null as Database|null;

open<sqlite3.Database, sqlite3.Statement>({
  filename: dbFilename,
  driver: sqlite3.Database
}).then((dbIn: Database) => {
  db = dbIn;
  if (!db) {
    throw new Error('failed to open DB ' + dbFilename);
  }

  debug('opened db', dbFilename);
  const query = 'DELETE FROM rsvps WHERE event = ?';
  return db?.run(query, eventId);
}).then(() => {
  debug('deleted rsvps');

  const query = 'DELETE FROM dateTimes WHERE event = ?';
  return db?.run(query, eventId);
}).then(() => {
  debug('deleted dateTimes');

  const query = 'DELETE FROM events WHERE rowid = ?';
  return db?.run(query, eventId);
}).then(() => {
  debug('deleted event');
  db?.close();
});
