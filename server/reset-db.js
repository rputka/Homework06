/* Deletes all data so the next `npm start` loads fresh seed data. Stop the server first.
   SQLite: deletes the database file. PostgreSQL (DATABASE_URL set): drops Nearhand's tables, but only when
   CONFIRM_RESET=1 is also set, so a production database can't be wiped by accident. */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ROOT } from './config.js';
import { TABLES } from './db/schema.js';

const config = loadConfig();
if (config.databaseUrl) {
  const host = new URL(config.databaseUrl).hostname;
  if (process.env.CONFIRM_RESET !== '1') {
    console.error(`This would delete every Nearhand table in the PostgreSQL database at ${host}.\nTo do it, run: CONFIRM_RESET=1 npm run reset-db`);
    process.exit(1);
  }
  const { default: pg } = await import('pg');
  const { poolConfig } = await import('./db/postgres.js');
  const client = new pg.Client(poolConfig(config));
  await client.connect();
  await client.query(`DROP TABLE IF EXISTS ${TABLES.join(', ')} CASCADE`);
  await client.end();
  console.log(`Dropped Nearhand's tables at ${host}. Start the server to recreate them and load fresh seed data.`);
} else {
  const { dbFile } = config;
  for (const file of [dbFile, dbFile + '-wal', dbFile + '-shm']) fs.rmSync(file, { force: true });
  console.log(`Deleted ${path.relative(ROOT, dbFile)}. Start the server to load fresh seed data.`);
}
