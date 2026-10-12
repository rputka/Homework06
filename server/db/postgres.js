/* PostgreSQL driver (the `pg` package), used when DATABASE_URL is set. Queries outside a transaction use the pool;
   a transaction checks out one client and runs every query on it, then commits, or rolls back on any error, and
   always releases the client. Settings: DATABASE_URL, AIVEN_CA_CERT (the provider's CA certificate, PEM), PG_POOL_MAX. */
import pg from 'pg';
import { HttpError } from '../lib/errors.js';
import { MIGRATIONS } from './schema.js';

const LOCK_ID = 7316; // pg_advisory_lock key for migrations and first-run seeding

/* COUNT(*) is BIGINT and AVG(...) is NUMERIC; pg returns both as strings by default. Ids and times here are BIGINT
   but far below 2^53, so plain numbers are safe. */
const NUMBER_TYPES = new Set([pg.types.builtins.INT8, pg.types.builtins.NUMERIC]);
const types = { getTypeParser: (oid, format) => (NUMBER_TYPES.has(oid) ? v => (v === null ? null : Number(v)) : pg.types.getTypeParser(oid, format)) };

/* Rewrites ? placeholders as $1, $2, ... (leaving any ? inside quoted strings alone). */
const converted = new Map();
function toPg(sql) {
  let out = converted.get(sql);
  if (out) return out;
  let n = 0, quote = null; out = '';
  for (const ch of sql) {
    if (quote) { if (ch === quote) quote = null; out += ch; }
    else if (ch === "'" || ch === '"') { quote = ch; out += ch; }
    else out += ch === '?' ? '$' + ++n : ch;
  }
  converted.set(sql, out);
  return out;
}

/* Errors the user caused (a malformed id, a double-submitted form) become 4xx responses instead of 500s. */
function translate(err) {
  if (err.code === '22P02' || err.code === '22003') return new HttpError(400, 'That request had an invalid value.');
  if (err.code === '23505') return new HttpError(409, 'That conflicts with a change that was just made. Reload and try again.');
  return err;
}

export function poolConfig(config) {
  const out = { max: Math.min(Math.max(Number(config.pgPoolMax) || 6, 2), 8), idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, types };
  const url = new URL(config.databaseUrl);
  if (config.dbCa) {
    // The URL's sslmode would override the ssl option below, so drop it and verify against the provider's CA.
    url.searchParams.delete('sslmode');
    out.ssl = { ca: config.dbCa, rejectUnauthorized: true };
  }
  out.connectionString = url.toString();
  if (config.pgSchema) out.options = `-c search_path=${config.pgSchema},public`; // tests: a throwaway schema per run
  return out;
}

export async function openPostgres(config, log = console) {
  if (!config.dbCa && /sslmode=/.test(config.databaseUrl)) log.log('Postgres: AIVEN_CA_CERT is not set. If the connection fails with "unable to verify the first certificate", set it to the CA certificate from the Aiven console.');
  const pool = new pg.Pool(poolConfig(config));
  pool.on('error', err => log.error('Postgres pool error:', err.message)); // an idle client dropped; the pool replaces it

  async function exclusive(fn) {
    const client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
      try { return await fn(); } finally { await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]); }
    } finally { client.release(); }
  }

  async function transaction(fn) {
    const client = await pool.connect();
    let broken;
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(e => { broken = e; }); // a client that can't roll back is discarded
      throw err;
    } finally { client.release(broken); }
  }

  await exclusive(async () => {
    if (config.pgSchema) await pool.query(`CREATE SCHEMA IF NOT EXISTS "${config.pgSchema}"`);
    await migrate(pool, transaction);
  });

  return {
    dialect: 'postgres',
    async query(tx, mode, sql, params) {
      let res;
      try { res = await (tx ? tx.conn : pool).query(toPg(mode === 'insert' ? sql + ' RETURNING id' : sql), params); }
      catch (err) { throw translate(err); }
      if (mode === 'all') return res.rows;
      if (mode === 'get') return res.rows[0];
      return mode === 'insert' ? res.rows[0].id : { changes: res.rowCount };
    },
    transaction,
    exclusive,
    close: () => pool.end()
  };
}

/* Applies pending migrations; the caller holds the advisory lock, so two servers starting at once can't both run them. */
async function migrate(pool, transaction) {
  const hasMeta = (await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'meta'")).rowCount > 0;
  let version = hasMeta ? Number(((await pool.query("SELECT value FROM meta WHERE key = 'schema_version'")).rows[0] || {}).value || 0) : 0;
  for (; version < MIGRATIONS.postgres.length; version++) {
    const sql = MIGRATIONS.postgres[version], next = String(version + 1);
    await transaction(async client => {
      await client.query(sql);
      await client.query("INSERT INTO meta (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [next]);
    });
  }
}
