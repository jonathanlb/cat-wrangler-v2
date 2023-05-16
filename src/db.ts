import sqlite from 'sqlite';
import { open } from 'sqlite';
import { Database, Statement } from 'sqlite3';

export function openDb(dbFilename: string): Promise<sqlite.Database> {
    return open<Database, Statement>({
        filename: dbFilename,
        driver: Database
      });
}