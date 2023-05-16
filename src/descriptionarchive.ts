import Debug from 'debug';
import { Database } from 'sqlite';
import { openDb } from './db';
import { TimeKeeper } from './timekeeper';

const debug = Debug('rsvp:descriptionarchive');
// const error = Debug('rsvp:descriptionarchive:error');

export type Edit = {
    author: number;
    event: number;
    description: string;
    timestamp: number;
}

export type DescriptionArchiveConfig = {
    dbFilename: string
}

export class DescriptionArchive {
    dbFilename: string;

    constructor(config: DescriptionArchiveConfig) {
        this.dbFilename = config.dbFilename;
    }

    async logEdit(db: Database, edit: Edit): Promise<void> {
        const query = 'INSERT OR REPLACE INTO descriptions(' +
            'author, description, event, timestamp) ' +
            'VALUES (?, ?, ?, ?)';
        debug('logEdit', query, edit);
        await db.run(query, [edit.author, edit.description, edit.event, edit.timestamp]);
    }

    async openDb(): Promise<Database> {
        return openDb(this.dbFilename);
      }

    async prepopulateArchive(tk: TimeKeeper, archDb: Database, defaultAuthor: number): Promise<void> {
        const now = new Date().getTime();
        const edit = {
            author: defaultAuthor,
            description: '',
            event: 0,
            timestamp: now,
        };

        const tkDb = await tk.openDb();
        try {
            const events = await tk.getEvents(tkDb);
            events.forEach(async (eid: number) => {
                const e = await tk.getEvent(tkDb, eid);
                edit.description = e?.description || '';
                await this.logEdit(archDb, edit);
            })
        } finally {
            tkDb.close();
        }
    }

    /**
     * Initialize the database.
     */
    async setup(): Promise<Database> {
        const statements = [
            'CREATE TABLE IF NOT EXISTS descriptions (' +
            'author INT NOT NULL, description TEXT NOT NULL, event INT NOT NULL, timestamp INT,' +
            'UNIQUE(author, event))',
            'CREATE INDEX IF NOT EXISTS idx_desc_author ON descriptions(author)',
            'CREATE INDEX IF NOT EXISTS idx_desc_event ON descriptions(event)',
            'CREATE INDEX IF NOT EXISTS idx_desc_timestamp ON descriptions(timestamp)',
        ];

        const db = await this.openDb();
        statements.forEach(async (s: string) => {
            debug(s);
            await db.exec(s);
        });
        return db;
    }

    async showEdits(db: Database, event: number): Promise<Array<Edit>> {
        const query = 'SELECT author, event, description, timestamp FROM descriptions WHERE event = ?';
        debug('showEdits', query);
        const result = await db.all(query, event)
        return result;
    }
}