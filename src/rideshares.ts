import { Database } from 'sqlite';

export type RideInterest = {
    name: string,
    neighborhood: string,
    provideSeats: number,
}

export class RideShares {
    async clearRideInterest(db: Database, participant: number, event: number): Promise<void> {
        const query = 'DELETE FROM rideshares WHERE participant = ? AND event = ?';
        await db.run(query, participant, event);
    }

    async expressRideInterest(db: Database, participant: number, event: number, provideSeats: number, neighborhood: string): Promise<void> {
        const query =
            'INSERT OR REPLACE INTO rideshares(event, participant, neighborhood, provideSeats) ' +
            'VALUES(:event, :participant, :neighborhood, :provideSeats)';
        await db.run(query, {
            ':event': event,
            ':participant': participant,
            ':neighborhood': neighborhood,
            ':provideSeats': provideSeats,
        });
    }

    async getRideInterest(db: Database, event: number): Promise<Array<RideInterest>> {
        const query =
            'SELECT p.name, r.neighborhood, r.provideSeats ' +
            'FROM participants AS p, rideshares AS r ' +
            'WHERE r.event = ? AND r.participant = p.rowid';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = db.all(query, event) as Promise<Array<any>>;
        return result as Promise<Array<RideInterest>>;
    }
}