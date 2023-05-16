import Debug from 'debug';

import { readFile } from 'node:fs/promises';
import { Database } from 'sqlite';
import { DateTime, Event, TimeKeeper, TimeKeeperOpts } from '../timekeeper';

const debug = Debug('rsvp:createEvent');
const errors = Debug('rsvp:createEvent:error');

export class EventCreator {
  tk: TimeKeeper;

  constructor(tkConfig: TimeKeeperOpts) { 
    this.tk = new TimeKeeper(tkConfig);
  }

  async run(ec: Event, dbOpt?: Database): Promise<number> {
    const db = dbOpt || await this.tk.openDb();
    try {
      const eid = await this.tk.createEvent(
        db, ec.name, ec.venue, ec.description
      );

      const dtIds = [] as Array<number>;
      ec.dateTimes.forEach(async (date: DateTime) => {
          debug('date', date);
          const dtId = await this.tk.createDateTime(
            db, eid, date.yyyymmdd, date.hhmm, date.duration,
          );
          dtIds.push(dtId);
      });

      // eslint-disable-next-line no-prototype-builtins
      if (ec.hasOwnProperty('dateTime') && typeof ec.dateTime === 'number') {
        this.tk.setDateTime(db, eid, dtIds[ec.dateTime]);
      }

      return eid;
    } catch(e) {
      errors('failed to create event: ' + e);
      return -1;
    } finally {
      if (!dbOpt) {
        db.close();
      }
    }
  }

  
  static async parseEventConfig(fileName: string): Promise<Event> {
    debug('reading event config', fileName);
    const buf = await readFile(fileName);
    const bufStr = buf.toString().trim();
    const result = JSON.parse(bufStr);
    if (typeof result != 'object') {
      throw new Error('no event object read: ' + bufStr);
    }
    if (typeof result.dateTimes != 'object' || 
        !result.dateTimes.hasOwnProperty('length')) // eslint-disable-line no-prototype-builtins
    {
      throw new Error('no event dateTimes array field: ' + bufStr);
    }
    return result as Event;
  }
}
