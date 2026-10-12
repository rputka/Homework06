/* The database layer's transaction rules, on whichever engine the tests run against (SQLite, or Postgres when
   DATABASE_URL is set). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';

let t, db;
before(async () => { t = await startApp(); db = t.app.db; await db.run("INSERT INTO meta (key, value) VALUES ('counter', '0')"); });
after(() => t.stop());

const counter = async () => Number(await db.getMeta('counter'));

test('a failed transaction rolls back everything, including nested transactions', async () => {
  await assert.rejects(db.tx(async () => {
    await db.setMeta('counter', 1);
    await db.tx(async () => { await db.setMeta('counter', 2); }); // joins the outer transaction
    throw new Error('boom');
  }), /boom/);
  assert.equal(await counter(), 0);
});

test('failed transactions give their connection back', async () => {
  // More failures than the pool has connections: a leaked connection would make this hang.
  for (let i = 0; i < 20; i++) await assert.rejects(db.tx(async () => { await db.setMeta('counter', 99); throw new Error('x'); }));
  for (let i = 0; i < 20; i++) await assert.rejects(db.tx(async () => { await db.run('SELECT * FROM no_such_table'); }));
  assert.equal(await counter(), 0);
  assert.equal((await db.get('SELECT 1 AS one')).one, 1);
});

test('concurrent transactions do not interleave', async () => {
  // Each transaction reads, waits, then writes read+1. Without isolation of whole transactions some increments are
  // lost; on SQLite the transaction lock serializes them, on Postgres the row lock (FOR UPDATE) does.
  const lock = db.dialect === 'postgres' ? ' FOR UPDATE' : '';
  const bump = () => db.tx(async () => {
    const n = Number((await db.get(`SELECT value FROM meta WHERE key = 'counter'${lock}`)).value);
    await new Promise(r => setTimeout(r, 5));
    await db.setMeta('counter', n + 1);
  });
  await Promise.all(Array.from({ length: 10 }, bump));
  assert.equal(await counter(), 10);
});

test('work started inside a transaction but run later does not use the finished transaction', async () => {
  let later;
  await db.tx(async () => { later = db.outside(() => new Promise(r => setTimeout(r, 20)).then(() => db.get('SELECT 1 AS one'))); });
  assert.equal((await later).one, 1);
  let stale;
  await db.tx(async () => { stale = new Promise(r => setTimeout(r, 20)).then(() => db.get('SELECT 1 AS one')); }); // still inside the tx's async context
  assert.equal((await stale).one, 1);
});

test('malformed ids are a 400 or a miss, never a server error', async () => {
  assert.equal(await db.get('SELECT id FROM jobs WHERE id = ?', Number('abc')), undefined); // NaN is sent as NULL
  if (db.dialect === 'postgres') await assert.rejects(db.get('SELECT id FROM jobs WHERE id = ?', 1.5), err => err.status === 400);
});
