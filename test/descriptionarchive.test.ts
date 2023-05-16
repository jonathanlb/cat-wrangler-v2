import { DescriptionArchive } from "../src/descriptionarchive";

const DB_FILE_NAME = ':memory:';
const ARCHIVE_CONFIG = {
    dbFilename: DB_FILE_NAME,
}

describe('DescriptionArchive tests', () => {
    test('logs edits overwriting old', async () => {
        const ar = new DescriptionArchive(ARCHIVE_CONFIG);
        const db = await ar.setup();

        const edit = {
            author: 1,
            event: 11,
            description: 'a',
            timestamp: 1,
        };

        try {
            await ar.logEdit(db, edit);

            edit.description = 'b';
            edit.timestamp++;
            await ar.logEdit(db, edit);

            const edits = await ar.showEdits(db, edit.event);
            expect(edits.length).toBe(1);
            expect(edits[0]).toEqual(edit);
        } finally {
            db.close();
        }
    })

});