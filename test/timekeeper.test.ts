import {
  TimeKeeper,
  validateDuration,
  validateHhMm,
  validateYyyyMmDd
} from '../src/timekeeper';

function newTimeKeeper(): TimeKeeper {
  return new TimeKeeper({
    dbFilename: ':memory:'
  });
}

describe('Sqlite server tests', () => {
  test('Instantiates a server', async () => {
    const tk = newTimeKeeper();
    await tk.setup();
  });

  test('Creates a venue with an id', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const vid = await tk.createVenue('The Bandshell', 'In the park', db);
    expect(vid).toEqual(1);
    await db.close();
  });

  test('Venue creation is idempotent', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const vid = await tk.createVenue('The Bandshell', 'In the park', db);
    const vid1 = await tk.createVenue('The Bandshell', 'In the park', db);
    expect(vid).toBe(vid1);
    await db.close();
  });

  test('Duplicate venue creation does not update address', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    await tk.createVenue('The Bandshell', 'In the park', db);
    await expect(tk.createVenue('The Bandshell', 'At the lake', db)).
      rejects.
      toThrow(Error);
    await db.close();
  });

  test('Searching for non-existent venue returns empty object', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const v = await tk.getVenueByName('The Grotto', db);
    expect(v).toBe(undefined);
    await db.close();
  });

  test('Searches for venue by name', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const vid = await tk.createVenue('The Bandshell', 'In the park', db);
    const venue = await tk.getVenueByName('The Bandshell', db);
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
    const eid = await tk.createEvent('Hula Contest', 17, 'Swing those hips!', db);
    expect(eid).toBe(1);
    await db.close();
  });

  test('Cannot create events with duplicate names', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    await tk.createEvent('Hula Contest', 17, 'Swing those hips!', db);
    let msg = '';
    try {
      await tk.createEvent('Hula Contest', 19, 'Hula before Hulu', db);
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
    const eid = await tk.createEvent('Hula Contest', 17, 'Swing those hips!', db);

    const e = await tk.getEvent(eid, undefined, db);
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
    const eid = await tk.createEvent('Hula Contest', vid, 'Swing those hips!', db);
    const did = await tk.createDateTime(eid, '2022-03-23', '16:31', '5m', db);
    await tk.rsvp(eid, pid, did, 1, db);
    const e = await tk.getEvent(eid, pid, db);
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

  test('Retrieves an event with a selected time', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const eid = await tk.createEvent('Hula Contest', 17, 'Swing those hips!', db);
    const did = await tk.createDateTime(eid, '2022-03-23', '16:31', '5m', db);
    await tk.closeEvent(eid, did, db);
    const e = await tk.getEvent(eid, undefined, db);

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
    const eid = await tk.createEvent('Hula Contest', 17, 'Swing those hips!', db);
    const did = await tk.createDateTime(eid, '2022-03-23', '16:31', '5m', db);
    await tk.closeEvent(eid, 0, db);
    const e = await tk.getEvent(eid, undefined, db);

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

  test('Queries for missing event', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const e = await tk.getEvent(1, undefined, db);
    expect(e).toBe(undefined);
    await db.close();
  });

  test('Creates a participant', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const pid = await tk.createParticipant('Bilbo', {}, db);
    expect(pid).toBe(1);
    await db.close();
  });

  test('Creates a participant with preset id', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const pid = await tk.createParticipant('Bilbo', { id: 67 }, db);
    expect(pid).toBe(67);
    await db.close();
  });

  test('Creates a dateTime', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const did = await tk.createDateTime(99, '2022-03-23', '16:31', '5m', db);
    expect(did).toBe(1);
    await db.close();
  });

  test('Retrieves a dateTime', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    const did = await tk.createDateTime(99, '2022-03-23', '16:31', '5m', db);
    const dt = await tk.getDateTime(did, db);
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
    const id = await tk.createParticipant('Bilbo', undefined, db);
    await tk.never(id, '2012-01-01', db);
    await tk.never(id, '2012-01-02', db);
    const nevers = await tk.getNevers(id, undefined, db);
    expect(nevers).toEqual(['2012-01-01', '2012-01-02']);

    const recentNevers = await tk.getNevers(id, '2012-01-01', db);
    expect(recentNevers).toEqual(['2012-01-02']);
  });

  test('Handles missing keys', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    expect(await tk.getValue(1, 'foo', db)).not.toBeDefined();
    await db.close();
  });

  test('Retrieves values for keys', async () => {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    await db.run(
      'INSERT INTO key_value(key, value) VALUES (\'foo\', \'bar\')',
    );
    expect(await tk.getValue(1, 'foo', db)).toEqual('bar');
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
