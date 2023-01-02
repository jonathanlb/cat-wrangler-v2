// Create a new event and insert it into a sqlite3 db.
// Usage: node src/admin/createEvent.js myEvent.json data/db.sqlite3
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
const eventConfigFile = process.argv[2];

debug('reading env');
dotenv.config();

const tkConfig = {
    dbFilename: process.env['RSVPS_SQLITE'] || 'data/rsvps.sqlite',
};

EventCreator.parseEventConfig(eventConfigFile).
  then((eventConfig) => {
    const ec = new EventCreator(tkConfig);
    return ec.run(eventConfig);
  });
