import { Database } from 'sqlite';

import { TimeKeeper } from '../src/timekeeper';
import { RideShares } from '../src/rideshares';

import { newTimeKeeper } from './timekeeper.test';

async function populateTimeKeeper (): Promise<[TimeKeeper, Database]> {
    const tk = newTimeKeeper();
    const db = await tk.setup();
    [ 'Bilbo', 'Frodo', 'Sam'].forEach(async (name, i) =>
        await tk.createParticipant(db, name, { id: i+1 }));
        await tk.createEvent(db, 'Hobbit Hop', 1, 'Dig it!');
        await tk.createEvent(db, 'Shire Swaray', 1, 'JR rolls in his grave.');
    return [tk, db];
}

describe('Sqlite rideshare tests', () => {
    test('Gets ride interest', async () => {
        const [, db] = await populateTimeKeeper();
        const rs = new RideShares();
        for (let i = 1; i <= 3; i++) {
            await rs.expressRideInterest(db, i, 1, 2, 'The Shire');
        }
        for (let i = 1; i <= 2; i++) {
            await rs.expressRideInterest(db, i, 2, 0, 'The Shire');
        }
        const result = await rs.getRideInterest(db, 1);
        expect(result.length).toBe(3);
    });

    test('Clears ride interest', async () => {
        const [, db] = await populateTimeKeeper();
        const rs = new RideShares();
        for (let i = 1; i <= 3; i++) {
            await rs.expressRideInterest(db, i, 1, 2, 'The Shire');
        }
        for (let i = 1; i <= 2; i++) {
            await rs.expressRideInterest(db, i, 2, 0, 'The Shire');
        }
        await rs.clearRideInterest(db, 1, 2);
        const result = await rs.getRideInterest(db, 2);
        expect(result.length).toBe(1);
    });

    test('Overwrites ride interest', async () => {
        const [, db] = await populateTimeKeeper();
        const rs = new RideShares();
        for (let i = 1; i <= 3; i++) {
            await rs.expressRideInterest(db, i, 1, i+1, 'The Shire');
        }
        await rs.expressRideInterest(db, 1, 1, 0, 'Mordor');
        const result = await rs.getRideInterest(db, 1);
        expect(result.length).toBe(3);
        expect(result.filter(r => r.name === 'Bilbo' && r.provideSeats === 0).length).toBe(1);
    });
});