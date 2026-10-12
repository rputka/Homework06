/* SQLite driver (Node's built-in node:sqlite). One connection, so work is serialized: a transaction holds a lock
   until it commits or rolls back, and other queries wait for it rather than slipping into it. */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from '../lib/errors.js';
import { MIGRATIONS } from './schema.js';

export function openSqlite(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    moveAsideLegacyFile(file);
  }
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  migrate(raw);

  const statements = new Map();
  const stmt = sql => { let s = statements.get(sql); if (!s) { s = raw.prepare(sql); statements.set(sql, s); } return s; };
  const lock = createMutex();

  function exec(mode, sql, params) {
    try {
      if (mode === 'all') return stmt(sql).all(...params);
      if (mode === 'get') return stmt(sql).get(...params);
      const r = stmt(sql).run(...params);
      return mode === 'insert' ? Number(r.lastInsertRowid) : { changes: Number(r.changes) };
    } catch (err) { throw translate(err); }
  }

  return {
    dialect: 'sqlite',
    async query(tx, mode, sql, params) { return tx ? exec(mode, sql, params) : lock(() => exec(mode, sql, params)); },
    transaction: fn => lock(async () => {
      raw.exec('BEGIN IMMEDIATE');
      try { const result = await fn(raw); raw.exec('COMMIT'); return result; }
      catch (err) { raw.exec('ROLLBACK'); throw err; }
    }),
    exclusive: fn => fn(), // one process owns the file
    async close() { raw.close(); }
  };
}

/* Runs async functions one at a time, in the order they were queued. */
function createMutex() {
  let tail = Promise.resolve();
  return fn => { const result = tail.then(fn); tail = result.catch(() => {}); return result; };
}

/* A unique-constraint clash means two requests raced to do the same thing (e.g. a double-clicked button). */
function translate(err) {
  if (/UNIQUE constraint failed/.test(err.message)) return new HttpError(409, 'That conflicts with a change that was just made. Reload and try again.');
  return err;
}

function migrate(raw) {
  const hasMeta = raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'").get();
  let version = hasMeta ? Number((raw.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() || {}).value || 0) : 0;
  for (; version < MIGRATIONS.sqlite.length; version++) {
    raw.exec('BEGIN');
    try {
      raw.exec(MIGRATIONS.sqlite[version]);
      raw.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(version + 1));
      raw.exec('COMMIT');
    } catch (err) { raw.exec('ROLLBACK'); throw err; }
  }
}

/* Databases from before the relational schema stored records as JSON in (id, data) tables. They can't be migrated
   in place, so the old file is renamed to <name>.legacy.db and a fresh database is created. */
function moveAsideLegacyFile(file) {
  if (!fs.existsSync(file)) return;
  const probe = new DatabaseSync(file);
  const legacy = probe.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'data'").get();
  probe.close();
  if (!legacy) return;
  const target = file.replace(/\.db$/, '') + '.legacy.db';
  for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(file + suffix)) fs.renameSync(file + suffix, target + suffix);
  console.log(`Moved the old-format database to ${path.basename(target)}; starting a new one.`);
}
