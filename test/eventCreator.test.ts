import { EventCreator } from '../src/admin/eventCreator';
import { Event } from '../src/timekeeper';

describe('eventCreator tests', () => {
  test('reads json event', async () => {
    const event = await EventCreator.parseEventConfig(
      './data/sample-event.json');
    expect(event.dateTimes.length).toBe(2);
  });

  test('records an event', async () => {
    const creator = new EventCreator({ dbFilename: ':memory:' });
    const db = await creator.tk.setup();
    const vid = await creator.tk.createVenue(db, 'The Bandshell', 'In the park');
    const ec = {
      name: 'Extravaganza',
      venue: vid,
      description: '# Best Test Event Evuh\nRSVP or ....',
      dateTimes:[
        { yyyymmdd: '2018-12-01', hhmm: '8:39', duration: '45m' },
        { yyyymmdd: '2018-12-01', hhmm: '9:06', duration: '45m' }
      ],
    } as Event; // Incomplete TS spec
    const eid = await creator.run(ec, db);
    expect(eid > 0).toBe(true);
    db.close();
  });

  test('records an event with a set time', async () => {
    const creator = new EventCreator({ dbFilename: ':memory:' });
    const db = await creator.tk.setup();
    const vid = await creator.tk.createVenue(db, 'The Bandshell', 'In the park');
    const ec = {
      name: 'Extravaganza',
      venue: vid,
      description: '# Best Test Event Evuh\nRSVP or ....',
      dateTime: 1,
      dateTimes:[
        { yyyymmdd: '2018-12-01', hhmm: '8:39', duration: '45m' },
        { yyyymmdd: '2018-12-01', hhmm: '9:06', duration: '45m' }
      ],
    } as Event; // Incomplete TS spec
    const eid = await creator.run(ec, db);
    expect(eid > 0).toBe(true);
    db.close();
  });

});
