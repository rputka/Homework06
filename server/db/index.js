/* Opens the database and offers small async query helpers. Two drivers share one interface: SQLite (Node's built-in
   node:sqlite, the default for local runs and tests) and PostgreSQL (when DATABASE_URL is set, e.g. on Aiven).
   All queries use ? parameters. Inside db.tx(fn), every db.* call made by fn (however deeply nested) runs on the
   transaction's connection; AsyncLocalStorage carries it, so services don't pass connections around. */
import { AsyncLocalStorage } from 'node:async_hooks';

export async function openDatabase(config, log = console) {
  // Drivers load only when used: local SQLite runs need nothing installed, and Postgres runs skip node:sqlite.
  const driver = config.databaseUrl ? await (await import('./postgres.js')).openPostgres(config, log) : (await import('./sqlite.js')).openSqlite(config.dbFile);
  const als = new AsyncLocalStorage();
  /* The open transaction this call belongs to, if any. A store is closed when its transaction ends, so work that
     was started inside a transaction but runs later (a timer, a background job) can't use a finished connection. */
  const current = () => { const s = als.getStore(); return s && s.open ? s : null; };
  const clean = params => params.map(p => (p === undefined || (typeof p === 'number' && Number.isNaN(p)) ? null : typeof p === 'boolean' ? Number(p) : p));
  const query = (mode, sql, params) => driver.query(current(), mode, sql, clean(params));

  return {
    dialect: driver.dialect,
    all: (sql, ...params) => query('all', sql, params),
    get: (sql, ...params) => query('get', sql, params),
    /* Resolves to { changes }. */
    run: (sql, ...params) => query('run', sql, params),
    /* Inserts one row and resolves to its new id. */
    insert: (sql, ...params) => query('insert', sql, params),
    /* Runs async fn inside one transaction (nested calls join the outer one). Rolls back if fn throws. */
    tx(fn) {
      if (current()) return fn();
      return driver.transaction(async conn => {
        const store = { conn, open: true };
        try { return await als.run(store, fn); } finally { store.open = false; }
      });
    },
    /* Runs fn outside any transaction, e.g. to start background work from inside one. */
    outside: fn => als.exit(fn),
    /* Runs fn while holding a lock shared by every server process on this database (first-run seeding). */
    exclusive: fn => driver.exclusive(fn),
    getMeta: async key => { const row = await query('get', 'SELECT value FROM meta WHERE key = ?', [key]); return row ? row.value : null; },
    setMeta: (key, value) => query('run', 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, String(value)]),
    close: () => driver.close()
  };
}
