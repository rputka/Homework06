/* Opens the SQLite database (Node's built-in node:sqlite), runs pending migrations, and offers small query helpers.
   All queries use ? parameters; prepared statements are cached. */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './schema.js';

export function openDatabase(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    moveAsideLegacyFile(file);
  }
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  migrate(raw);

  const statements = new Map();
  const stmt = sql => { let s = statements.get(sql); if (!s) { s = raw.prepare(sql); statements.set(sql, s); } return s; };
  const clean = params => params.map(p => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));
  let depth = 0;

  const db = {
    all: (sql, ...params) => stmt(sql).all(...clean(params)),
    get: (sql, ...params) => stmt(sql).get(...clean(params)),
    /* Returns { changes, lastInsertRowid }. */
    run: (sql, ...params) => stmt(sql).run(...clean(params)),
    insert: (sql, ...params) => Number(stmt(sql).run(...clean(params)).lastInsertRowid),
    exec: sql => raw.exec(sql),
    /* Runs fn inside one transaction (nested calls join the outer one). Rolls back if fn throws. */
    tx(fn) {
      if (depth) return fn();
      raw.exec('BEGIN IMMEDIATE'); depth++;
      try { const result = fn(); raw.exec('COMMIT'); return result; }
      catch (err) { raw.exec('ROLLBACK'); throw err; }
      finally { depth--; }
    },
    getMeta: key => { const row = stmt('SELECT value FROM meta WHERE key = ?').get(key); return row ? row.value : null; },
    setMeta: (key, value) => stmt('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value)),
    close: () => raw.close()
  };
  return db;
}

function migrate(raw) {
  const hasMeta = raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'").get();
  let version = hasMeta ? Number((raw.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() || {}).value || 0) : 0;
  for (; version < MIGRATIONS.length; version++) {
    raw.exec('BEGIN');
    try {
      raw.exec(MIGRATIONS[version]);
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
