/* Deletes the database and uploaded photos so the next `npm start` loads fresh seed data. Stop the server first. */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ROOT } from './config.js';

const { dbFile, uploadsDir } = loadConfig();
for (const file of [dbFile, dbFile + '-wal', dbFile + '-shm']) fs.rmSync(file, { force: true });
fs.rmSync(uploadsDir, { recursive: true, force: true });
console.log(`Deleted ${path.relative(ROOT, dbFile)} and uploaded photos. Start the server to load fresh seed data.`);
