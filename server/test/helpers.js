/* Test helpers: start the whole app on a throwaway database and a random port, and make API clients that keep their
   own session cookie (one per pretend user). The database is a temporary SQLite file, or, when DATABASE_URL is set
   (e.g. `DATABASE_URL=postgres://... npm test`), a temporary schema in that PostgreSQL database, dropped afterward. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';

const quiet = { log() {}, error() {} };

export async function startApp(env = {}) {
  const pgUrl = process.env.DATABASE_URL;
  const dir = pgUrl ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'nearhand-test-'));
  const schema = pgUrl ? 't_' + crypto.randomBytes(6).toString('hex') : null;
  const db = pgUrl ? { DATABASE_URL: pgUrl, AIVEN_CA_CERT: process.env.AIVEN_CA_CERT || '', PG_SCHEMA: schema } : { DB_FILE: path.join(dir, 'test.db') };
  const config = loadConfig({ ...db, RUN_WORKERS: '0', PORT: '0', ...env });
  const app = await createApp(config, { log: quiet });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return {
    app, base, config,
    client: () => client(base),
    /* A client already signed in as a seeded account (password demo1234). */
    async as(email) { const c = client(base); const r = await c.post('/api/auth/login', { email, password: 'demo1234' }); if (!r.ok) throw new Error('login failed: ' + r.error); return c; },
    async stop() {
      await app.close();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
      if (schema) await dropSchema(config, schema);
    }
  };
}

async function dropSchema(config, schema) {
  const { default: pg } = await import('pg');
  const { poolConfig } = await import('../db/postgres.js');
  const c = new pg.Client(poolConfig({ ...config, pgSchema: null }));
  await c.connect();
  try { await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await c.end(); }
}

function client(base) {
  let cookie = '';
  async function call(method, url, body, headers = {}) {
    const res = await fetch(base + url, { method, headers: { 'X-Nearhand': '1', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data };
  }
  return {
    get: url => call('GET', url), post: (url, body = {}, headers) => call('POST', url, body, headers), put: (url, body) => call('PUT', url, body), del: url => call('DELETE', url),
    raw: call, get cookie() { return cookie; }
  };
}

/* A tiny valid PNG, for upload tests. */
export const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
