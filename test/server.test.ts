import { Server } from '../src/server';

function newServer(): Server {
  return new Server({
    dbFilename: ':memory:'
  });
}

describe('Sqlite server tests', () => {
  test('Instantiates a server', async () => {
    const s = newServer();
    await s.setup();
  });

  test('Creates a venue with an id', async () => {
    const s = newServer();
    const db = await s.setup();
    const vid = await s.createVenue('The Bandshell', 'In the park', db);
    expect(vid).toEqual(1);
    await db.close();
  });

  test('Venue creation is idempotent', async () => {
    const s = newServer();
    const db = await s.setup();
    const vid = await s.createVenue('The Bandshell', 'In the park', db);
    const vid1 = await s.createVenue('The Bandshell', 'In the park', db);
    expect(vid).toBe(vid1);
    await db.close();
  });

  test('Duplicate venue creation does not update address', async () => {
    const s = newServer();
    const db = await s.setup();
    await s.createVenue('The Bandshell', 'In the park', db);
    await expect(s.createVenue('The Bandshell', 'At the lake', db)).
      rejects.
      toThrow(Error);
    await db.close();
  });

  test('Searching for non-existent venue returns empty object', async () => {
    const s = newServer();
    const db = await s.setup();
    const v = await s.getVenueByName('The Grotto', db);
    expect(v).toBe(undefined);
    await db.close();
  });

  test('Searches for venue by name', async () => {
    const s = newServer();
    const db = await s.setup();
    const vid = await s.createVenue('The Bandshell', 'In the park', db);
    const venue = await s.getVenueByName('The Bandshell', db);
    expect(venue).toEqual({
      address: 'In the park',
      name: 'The Bandshell',
      id: vid
    });
    await db.close();
  });

  test('Creates an event', async () => {
    const s = newServer();
    const db = await s.setup();
    const eid = await s.createEvent('Hula Contest', 17, 'Swing those hips!', db);
    expect(eid).toBe(1);
    await db.close();
  });
});
