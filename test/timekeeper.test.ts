import {
  TimeKeeper,
  validateDuration,
  validateHhMm,
  validateYyyyMmDd
} from '../src/timekeeper';

export function newTimeKeeper(): TimeKeeper {
  return new TimeKeeper({
    dbFilename: ':memory:'
  });
}

describe('Sqlite timekeeper tests', () => {
  test('Instantiates a timekeeper', async () => {
    const tk = newTimeKeeper();
    await tk.setup();
  });

  test('Creates organizer participants', async () => {
    const name = 'Bilbo Baggins';
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const pid = await tk.createParticipant(db, name, { organizer: 1 });
    expect(pid).toBe(1);
    await db.close();
  });

  test('Gets user ids from names', async () => {
    const name = 'Bilbo Baggin\'';
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const pid = await tk.createParticipant(db, name);
    const pid1 = await tk.getUserId(db, name);
    expect(pid1).toEqual(pid);
    const pid2 = await tk.getUserId(db, 'Arwen');
    expect(pid2).toEqual(-1);
    await db.close();
  });

  test('Gets user ids from email', async () => {
    const name = 'Bilbo Baggin\'';
    const email = 'bilbo@bag.end';
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const pid = await tk.createParticipant(db, name, { email });
    const pid1 = await tk.getUserIdByEmail(db, email);
    expect(pid1).toEqual(pid);
    await db.close();
  });

  test('Gets user info from ids', async () => {
    const name = 'Bilbo Baggin\'';
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const pid = await tk.createParticipant(db, name);
    const info = await tk.getUserInfo(db, pid);
    expect(info).toEqual({
      email: '',
      id: 1,
      name,
      organizer: 0,
      section: '',
    });
    const noInfo = await tk.getUserInfo(db, pid + 1);
    expect(noInfo).not.toBeDefined();
    await db.close();
  });

  test('Creates a venue with an id', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const vid = await tk.createVenue(db, 'The Bandshell', 'In the park');
    expect(vid).toEqual(1);
    await db.close();
  });

  test('Venue creation is idempotent', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const vid = await tk.createVenue(db, 'The Bandshell', 'In the park');
    const vid1 = await tk.createVenue(db, 'The Bandshell', 'In the park');
    expect(vid).toBe(vid1);
    await db.close();
  });

  test('Duplicate venue creation does not update address', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    await tk.createVenue(db, 'The Bandshell', 'In the park');
    await expect(tk.createVenue(db, 'The Bandshell', 'At the lake')).
      rejects.
      toThrow(Error);
    await db.close();
  });

  test('Searching for non-existent venue returns empty object', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const v = await tk.getVenueByName(db, 'The Grotto');
    expect(v).toBe(undefined);
    await db.close();
  });

  test('Searches for venue by name', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const vid = await tk.createVenue(db, 'The Bandshell', 'In the park');
    const venue = await tk.getVenueByName(db, 'The Bandshell');
    expect(venue).toEqual({
      address: 'In the park',
      name: 'The Bandshell',
      id: vid
    });
    await db.close();
  });

  test('Creates an event', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const eid = await tk.createEvent(db, 'Hula Contest', 17, 'Swing those hips!');
    expect(eid).toBe(1);
    await db.close();
  });

  test('Cannot create events with duplicate names', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    await tk.createEvent(db, 'Hula Contest', 17, 'Swing those hips!');
    let msg = '';
    try {
      await tk.createEvent(db, 'Hula Contest', 19, 'Hula before Hulu');
    } catch (_err) {
      const err = _err as Error;
      msg = err.message;
    }
    expect(msg).toEqual('SQLITE_CONSTRAINT: UNIQUE constraint failed: events.name');
    await db.close();
  });

  test('Retrieves an event', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const eid = await tk.createEvent(db, 'Hula Contest', 17, 'Swing those hips!');

    const e = await tk.getEvent(db, eid);
    expect(e).toEqual({
      dateTime: undefined,
      dateTimes: [],
      description: 'Swing those hips!',
      id: eid,
      name: 'Hula Contest',
      venue: 17
    });
    await db.close();
  });

  test('Retrieves an event for a user', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const vid = 17;
    const pid = 19;
    const eid = await tk.createEvent(db, 'Hula Contest', vid, 'Swing those hips!');
    const did = await tk.createDateTime(db, eid, '2022-03-23', '16:31', '5m');
    await tk.rsvp(db, eid, pid, did, 1);
    const e = await tk.getEvent(db, eid, pid);
    expect(e).toEqual({
      dateTime: undefined,
      dateTimes: [{
        attend: 1,
        duration: '5m',
        event: eid,
        hhmm: '16:31',
        id: did,
        yyyymmdd: '2022-03-23'
      }],
      description: 'Swing those hips!',
      id: eid,
      name: 'Hula Contest',
      venue: 17
    });
    await db.close();
  });

  test('Lists events', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const vid = 17;
    const eid0 = await tk.createEvent(db, 'Hula Contest', vid, 'Swing those hips!');
    await tk.createDateTime(db, eid0, '2022-03-23', '16:31', '5m');

    const eid1 = await tk.createEvent(db, 'Another Hula Contest', vid, 'Keep going!');
    await tk.createDateTime(db, eid1, '2022-05-23', '16:36', '5m');

    const eids = await tk.getEvents(db);
    expect(eids.sort()).toEqual([eid0, eid1]);
    await db.close();
  });

  test('Lists events after a date', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const vid = 17;
    const eid0 = await tk.createEvent(db, 'Hula Contest', vid, 'Swing those hips!');
    await tk.createDateTime(db, eid0, '2022-03-23', '16:31', '5m');

    const eid1 = await tk.createEvent(db, 'Another Hula Contest', vid, 'Keep going!');
    await tk.createDateTime(db, eid1, '2022-05-23', '16:36', '5m');

    const eids = await tk.getEventsAfter(db, '2022-05-23');
    expect(eids.sort()).toEqual([eid1]);
    await db.close();
  });

  test('Retrieves rsvps', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const vid = 17;
    const pid = 19;
    const eid = await tk.createEvent(db, 'Hula Contest', vid, 'Swing those hips!');
    const did = await tk.createDateTime(db, eid, '2022-03-23', '16:31', '5m');
    const did1 = await tk.createDateTime(db, eid, '2022-03-23', '16:36', '5m');
    await tk.rsvp(db, eid, pid, did, 1);
    await tk.rsvp(db, eid, pid, did1, -1);
    await tk.rsvp(db, eid, pid, did, 0);

    const rsvps = await tk.getRsvps(db, eid, pid);
    expect(rsvps).toEqual({ [did]: 0, [did1]: -1 });
    await db.close();
  });

  test('Retrieves an event with a selected time', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const eid = await tk.createEvent(db, 'Hula Contest', 17, 'Swing those hips!');
    const did = await tk.createDateTime(db, eid, '2022-03-23', '16:31', '5m');
    await tk.closeEvent(db, eid, did);
    const e = await tk.getEvent(db, eid);

    const dt = {
      duration: '5m',
      event: eid,
      hhmm: '16:31',
      id: did,
      yyyymmdd: '2022-03-23'
    };
    expect(e).toEqual({
      dateTime: dt,
      dateTimes: [dt],
      description: 'Swing those hips!',
      id: eid,
      name: 'Hula Contest',
      venue: 17
    });
    await db.close();
  });

  test('Retrieves an event with a canceled time', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const eid = await tk.createEvent(db, 'Hula Contest', 17, 'Swing those hips!');
    const did = await tk.createDateTime(db, eid, '2022-03-23', '16:31', '5m');
    await tk.closeEvent(db, eid, 0);
    const e = await tk.getEvent(db, eid);

    const dt = {
      duration: '5m',
      event: eid,
      hhmm: '16:31',
      id: did,
      yyyymmdd: '2022-03-23'
    };
    expect(e).toEqual({
      dateTime: undefined,
      dateTimes: [dt],
      description: 'Swing those hips!',
      id: eid,
      name: 'Hula Contest',
      venue: 17
    });
    await db.close();
  });

  test('Joins rsvps to events', async () => {
    const eventName = 'Elevensies';
    const venueName = 'The Shire';
    const address = 'It\'s fictional';
    const times = [['2018-12-01', '10:59', '90m'], ['2018-12-01', '11:02', '87m']];
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const venue = await tk.createVenue(db, venueName, address);
    const eventId = await tk.createEvent(db, eventName, venue, 'Be a hobbit');
    times.forEach(async (dt) => {
      await tk.createDateTime(db, eventId, dt[0], dt[1], dt[2]);
    });
    await tk.rsvp(db, 1, 1, 2, 1);
    const eventObj = await tk.getEvent(db, 1, 1);

    // Test is sloppy with dateTime ids, which can get jumbled
    expect(eventObj?.dateTimes || []).toHaveLength(2);
    expect((eventObj?.dateTimes || []).find((x) => x.yyyymmdd === '2018-12-01' &&
        x.hhmm === '10:59' &&
        x.duration === '90m')).toBeTruthy();
    expect((eventObj?.dateTimes || []).find((x) => x.yyyymmdd === '2018-12-01' &&
        x.hhmm === '11:02' &&
        x.duration === '87m')).toBeTruthy();
    expect((eventObj?.dateTimes || []).reduce(
      (acc, x) => (x.attend ? acc + 1 : acc),
      0,
    )).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (eventObj as any).dateTimes = []; // delete, verify elsewhere

    expect(eventObj).toEqual({
      id: 1,
      name: eventName,
      description: 'Be a hobbit',
      venue: 1,
      dateTime: undefined,
      dateTimes: []
    });
    await db.close();
  });

  test('Queries for missing event', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const e = await tk.getEvent(db, 1);
    expect(e).toBe(undefined);
    await db.close();
  });

  test('Retrieves no events upon init', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const es = await tk.getEvents(db);
    expect(es).toEqual([]);
    await db.close();
  });

  test('Retrieves all events', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const eid0 = await tk.createEvent(db, 'Hula Contest', 17, 'Swing those hips!');
    const eid1 = await tk.createEvent(db, 'Boogy Woogy', 11, 'Shake it!');
    const es = await tk.getEvents(db);
    expect(new Set(es)).toEqual(new Set([eid0, eid1]));
    await db.close();
  });

  test('Creates a participant', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const pid = await tk.createParticipant(db, 'Bilbo', {});
    expect(pid).toBe(1);
    await db.close();
  });

  test('Creates a participant with preset id', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const pid = await tk.createParticipant(db, 'Bilbo', { id: 67 });
    expect(pid).toBe(67);
    await db.close();
  });

  test('Creates a dateTime', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const did = await tk.createDateTime(db, 99, '2022-03-23', '16:31', '5m');
    expect(did).toBe(1);
    await db.close();
  });

  test('Retrieves a dateTime', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const did = await tk.createDateTime(db, 99, '2022-03-23', '16:31', '5m');
    const dt = await tk.getDateTime(db, did);
    expect(dt).toEqual({
      id: did,
      event: 99,
      yyyymmdd: '2022-03-23',
      hhmm: '16:31',
      duration: '5m'
    });
    await db.close();
  });

  test('Gets never attend dates', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const id = await tk.createParticipant(db, 'Bilbo');
    await tk.never(db, id, '2012-01-01');
    await tk.never(db, id, '2012-01-02');
    const nevers = await tk.getNevers(db, id);
    expect(nevers).toEqual(['2012-01-01', '2012-01-02']);

    const recentNevers = await tk.getNevers(db, id, '2012-01-01');
    expect(recentNevers).toEqual(['2012-01-02']);
  });

  test('Collects RSVPs', async () => {
     const tk = newTimeKeeper();
     const db = await tk.setup();
     const bilbo = await tk.createParticipant(db, 'Bilbo', { organizer: 1 });
     const frodo = await tk.createParticipant(db, 'Frodo');
     const venueId = await tk.createVenue(db, 'Baggins End', 'The Shire');
     const eventId = await tk.createEvent(db, 'Elevensies', venueId, 'Be a hobbit');
     const dt1 = await tk.createDateTime(db, eventId, '2012-01-01', '10:59', '60m');
     const dt2 = await tk.createDateTime(db, eventId, '2012-01-01', '10:58', '60m');
     const dt3 = await tk.createDateTime(db, eventId, '2012-01-01', '10:57', '60m');
     await tk.rsvp(db, eventId, bilbo, dt1, 1);
     await tk.rsvp(db, eventId, bilbo, dt2, 1);
     await tk.rsvp(db, eventId, frodo, dt1, 1);
     await tk.rsvp(db, eventId, frodo, dt2, -1);

     let rsvps = await tk.collectRsvps(db, eventId, bilbo);
     const expectedAdminResult = {
       [dt1]: { [bilbo]: 1, [frodo]: 1 },
       [dt2]: { [bilbo]: 1, [frodo]: -1 },
     };
     expect(rsvps).toEqual(expectedAdminResult);

     let expectedResult = {
       [dt1]: { 1: 2 },
       [dt2]: { 1: 1, '-1': 1 },
     } as any;  // eslint-disable-line @typescript-eslint/no-explicit-any

     rsvps = await tk.summarizeRsvps(db, eventId, 0);
     expect(rsvps).toEqual(expectedResult);

     rsvps = await tk.summarizeRsvps(db, eventId, frodo);
     expectedResult = {
       [dt1]: { 1: 2 },
       [dt2]: { 1: 1, '-1': 1 },
       [dt3]: { 0: 1 },
     } as any;  // eslint-disable-line @typescript-eslint/no-explicit-any
     expect(rsvps).toEqual(expectedResult);
     rsvps = await tk.summarizeRsvps(db, eventId, frodo);
     expect(rsvps).toEqual(expectedResult);

     await db.close();
   });

   test('Collecting RSVPS respects nevers', async () => {
     const tk = newTimeKeeper();

     const db = await tk.setup();
     const bilbo = await tk.createParticipant(db, 'Bilbo', { organizer: 1 });
     const frodo = await tk.createParticipant(db, 'Frodo');
     const venue = await tk.createVenue(db, 'Baggins End', 'The Shire');
     const eventId = await tk.createEvent(db, 'Elevensies', venue, 'Be a hobbit');
     await tk.never(db, bilbo, '2012-01-01');
     let rsvpAdminSummary = await tk.collectRsvps(db, eventId, bilbo);
     let expectedAdminResult = { };
     expect(rsvpAdminSummary).toEqual(expectedAdminResult);

     const dt1 = await tk.createDateTime(db, eventId, '2012-01-01', '10:00', '60m');
     const dt2 = await tk.createDateTime(db, eventId, '2012-01-02', '10:00', '60m');
     rsvpAdminSummary = await tk.collectRsvps(db, eventId, bilbo);
     expectedAdminResult = {
       [dt1]: { [bilbo]: -1 },
     };
     expect(rsvpAdminSummary).toEqual(expectedAdminResult);

     await tk.never(db, frodo, '2012-01-02');
     rsvpAdminSummary = await tk.collectRsvps(db, eventId, bilbo);
     expectedAdminResult = {
       [dt1]: { [bilbo]: -1 },
       [dt2]: { [frodo]: -1 },
     };
     expect(rsvpAdminSummary).toEqual(expectedAdminResult);

     await tk.rsvp(db, eventId, bilbo, dt2, 1);
     await tk.rsvp(db, eventId, frodo, dt1, 1);
     rsvpAdminSummary = await tk.collectRsvps(db, eventId, bilbo);
     expectedAdminResult = {
       [dt1]: { [bilbo]: -1, [frodo]: 1 },
       [dt2]: { [bilbo]: 1, [frodo]: -1 },
     };
     expect(rsvpAdminSummary).toEqual(expectedAdminResult);

     await tk.never(db, bilbo, '2012-01-02');
     rsvpAdminSummary = await tk.collectRsvps(db, eventId, bilbo);
     expectedAdminResult = {
       [dt1]: { [bilbo]: -1, [frodo]: 1 },
       [dt2]: { [bilbo]: -1, [frodo]: -1 },
     };
     expect(rsvpAdminSummary).toEqual(expectedAdminResult);

     await db.close();
   });

   test('Gets never attend dates', async () => {
     const tk = newTimeKeeper();
     const db = await tk.setup();
     const id = await tk.createParticipant(db, 'Bilbo');
     await tk.never(db, id, '2012-01-01');
     await tk.never(db, id, '2012-01-02');
     const nevers = await tk.getNevers(db, id);
     expect(nevers).toEqual(['2012-01-01', '2012-01-02']);

     const recentNevers = await tk.getNevers(db, id, '2012-01-01');
     expect(recentNevers).toEqual(['2012-01-02']);
   });

   test('Sets default rsvp to zero on summary', async () => {
     const tk = newTimeKeeper();
     const db = await tk.setup();
     const bilbo = await tk.createParticipant(db, 'Bilbo', { organizer: 1 });
     const frodo = await tk.createParticipant(db, 'Frodo', undefined);
     const venueId = await tk.createVenue(db, 'Baggins End', 'The Shire');
     const eventId = await tk.createEvent(db, 'Elevensies', venueId, 'Be a hobbit');
     const dt1 = await tk.createDateTime(db, eventId, '2012-01-01', '10:59', '60m');
     const dt2 = await tk.createDateTime(db, eventId, '2012-01-01', '10:58', '60m');
     await tk.rsvp(db, eventId, bilbo, dt1, 1);
     await tk.rsvp(db, eventId, bilbo, dt2, 1);

     let rsvps = await tk.collectRsvps(db, eventId, bilbo);
     let expectedAdminResult = {
       [dt1]: { [bilbo]: 1 },
       [dt2]: { [bilbo]: 1 },
     };
     expect(rsvps).toEqual(expectedAdminResult);

     await tk.summarizeRsvps(db, eventId, frodo);
     rsvps = await tk.collectRsvps(db, eventId, bilbo);
     expectedAdminResult = {
       [dt1]: { [bilbo]: 1, [frodo]: 0 },
       [dt2]: { [bilbo]: 1, [frodo]: 0 },
     };
     expect(rsvps).toEqual(expectedAdminResult);
     await db.close();
   });

   test('Updates user section', async () => {
     const tk = newTimeKeeper();
     const db = await tk.setup();
     await tk.createParticipant(db, 'Bilbo', { section: 'Hobbit' });
     let sectionResponse = await tk.updateUserSection(db, 1, 'nephew');
     expect(sectionResponse).toEqual('Hobbit');
     await db.run('INSERT INTO sections(name) VALUES (\'adventurer\')');
     sectionResponse = await tk.updateUserSection(db, 1, 'Adventurer');
     expect(sectionResponse).toEqual('adventurer');
     await db.close();
   });

  test('Handles missing keys', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    expect(await tk.getValue(db, 'foo')).not.toBeDefined();
    await db.close();
  });

  test('Retrieves values for keys', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    await db.run(
      'INSERT INTO key_value(key, value) VALUES (\'foo\', \'bar\')',
    );
    expect(await tk.getValue(db, 'foo')).toEqual('bar');
    await db.close();
  });

  test('Validates duration', () => {
    validateDuration('30m');
    expect(() => validateDuration('')).toThrow();
    expect(() => validateDuration('1 sec')).toThrow();
    expect(() => validateDuration('90s')).toThrow();
    expect(() => validateDuration('90 m')).toThrow();
  });

  test('Validates hhmm', () => {
    validateHhMm('12:00');
    validateHhMm('1:59');
    validateHhMm('23:59');
    expect(() => validateHhMm('')).toThrow();
    expect(() => validateHhMm('11:00 am')).toThrow();
    expect(() => validateHhMm('12pm')).toThrow();
    expect(() => validateHhMm('12')).toThrow();
    expect(() => validateHhMm('noon')).toThrow();
  });

  test('Validates yyyymmdd', () => {
    validateYyyyMmDd('2018/12/01');
    validateYyyyMmDd('2018-12-01');
    validateYyyyMmDd('2018-12-1');
    validateYyyyMmDd('2018-2-01');
    expect(() => validateYyyyMmDd('')).toThrow();
    expect(() => validateYyyyMmDd('201-12-01')).toThrow();
    expect(() => validateYyyyMmDd('Christmas')).toThrow();
  });
});
