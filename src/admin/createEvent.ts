// Create a new event and insert it into a sqlite3 db.
// Usage: node dist/createEvent myEvent.json [data/db.sqlite3]
//
// Example event configuration file contents:
// {
//   "name": "Extravaganza",
//   "venue": 37,
//   "description": "# Best Test Event Evuh\nRSVP or ....",
//   "dateTimes": [
//     { "yyyymmdd": "2018-12-01", "hhmm": "8:39", "duration": "45m" },
//     { "yyyymmdd": "2018-12-01", "hhmm": "9:06", "duration": "45m" }
//   ]
// }
import Debug from 'debug';
import { EventCreator } from './eventCreator';
import * as dotenv from 'dotenv';

const debug = Debug('rsvp:createEvent');
if (process.argv.length < 3) {
  throw new Error('usage: node dist/createEvent.js <event.json> [db.sqlite3]');
}

debug('reading env');
dotenv.config();

const eventConfigFile = process.argv[2];
const dbFilename = process.argv.length > 3 ?
  process.argv[3] :
  process.env['RSVPS_SQLITE'] || 'data/rsvps.sqlite';


const tkConfig = { dbFilename };

EventCreator.parseEventConfig(eventConfigFile).
  then((eventConfig) => {
    const ec = new EventCreator(tkConfig);
    return ec.run(eventConfig);
  });
