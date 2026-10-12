/* Accounts, sessions and the rules about who can see and do what. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, TINY_PNG } from './helpers.js';

let t;
before(async () => { t = await startApp(); });
after(() => t.stop());

test('sign up, verify, sign in, and passwords are hashed', async () => {
  const c = t.client();
  const r = await c.post('/api/auth/signup', { role: 'worker', name: 'Test Person', email: 'Test.Person@example.com', password: 'longpassword', phone: '(512) 555-0199', location: 'austin tx' });
  assert.equal(r.ok, true, r.error);
  assert.equal((await c.get('/api/session')).pending.email, 'test.person@example.com');
  const early = await t.client().post('/api/auth/login', { email: 'test.person@example.com', password: 'longpassword' });
  assert.equal(early.status, 403); assert.equal(early.code, 'unverified');
  assert.equal((await c.post('/api/auth/verify')).ok, true);
  const s = await c.get('/api/session');
  assert.equal(s.me.name, 'Test Person'); assert.equal(s.me.location, 'Austin, TX');
  const row = await t.app.db.get('SELECT password_hash FROM users WHERE email = ?', 'test.person@example.com');
  assert.match(row.password_hash, /^scrypt:/);
  assert.equal(JSON.stringify(s).includes('scrypt'), false, 'hash never sent to the browser');
  assert.equal((await t.client().post('/api/auth/login', { email: 'test.person@example.com', password: 'wrong-password' })).status, 401);
});

test('the session token changes on sign-in and is gone after sign-out', async () => {
  const c = t.client();
  await c.post('/api/auth/forgot', { email: 'nobody@example.com' }); // creates a signed-out session
  const before = c.cookie;
  await c.post('/api/auth/login', { email: 'dana@example.com', password: 'demo1234' });
  assert.ok(c.cookie && c.cookie !== before, 'token rotated');
  await c.post('/api/auth/logout');
  assert.equal(c.cookie, '');
  assert.equal((await c.get('/api/dashboard')).status, 401);
});

test('signed-out visitors get no marketplace data', async () => {
  const c = t.client();
  for (const url of ['/api/jobs', '/api/workers', '/api/dashboard', '/api/jobs/1', '/api/users/1', '/api/conversations']) assert.equal((await c.get(url)).status, 401, url);
});

test('employers only see their own jobs; workers can only do worker things', async () => {
  const priya = await t.as('priya@example.com'), marcus = await t.as('marcus@example.com');
  const danaJob = (await t.app.db.get("SELECT id FROM jobs WHERE employer_id = (SELECT id FROM users WHERE email = 'dana@example.com') AND status = 'Open for Bids'")).id;
  assert.equal((await priya.get('/api/jobs/' + danaJob)).status, 404, "another employer's job is not found");
  assert.equal((await priya.get('/api/jobs')).status, 403, 'employers have no Find jobs');
  assert.equal((await marcus.get('/api/workers')).status, 403, 'workers have no Find workers');
  const post = await marcus.post('/api/jobs', { title: 'x', category: 'plumbing', description: 'A worker trying to post a job here.', location: 'Austin, TX', experience: '0–2 years', budgetMin: 1, budgetMax: 2 });
  assert.equal(post.status, 403);
  const awaiting = (await t.app.db.get("SELECT id FROM jobs WHERE status = 'Awaiting Approval'")).id;
  assert.equal((await marcus.post(`/api/jobs/${awaiting}/confirm`)).status, 403, 'only the owner confirms');
});

test('writes need the site header and a same-site origin', async () => {
  const c = t.client();
  assert.equal((await c.raw('POST', '/api/auth/login', { email: 'dana@example.com', password: 'demo1234' }, { 'X-Nearhand': '' })).status, 403);
  assert.equal((await c.raw('POST', '/api/auth/login', { email: 'dana@example.com', password: 'demo1234' }, { Origin: 'https://evil.example' })).status, 403);
});

test('sign-in attempts are rate limited', async () => {
  const c = t.client();
  let last;
  for (let i = 0; i < 11; i++) last = await c.post('/api/auth/login', { email: 'tom@example.com', password: 'nope' });
  assert.equal(last.status, 429);
});

test('uploads accept real images only', async () => {
  const marcus = await t.as('marcus@example.com');
  assert.match((await marcus.post('/api/uploads', { dataUrl: TINY_PNG })).url, /^\/uploads\//);
  const fake = 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64');
  assert.equal((await marcus.post('/api/uploads', { dataUrl: fake })).status, 400);
  assert.equal((await t.client().post('/api/uploads', { dataUrl: TINY_PNG })).status, 401);
  const bid = await marcus.post('/api/jobs/1/bids', { price: 10, message: 'Using a photo from another site here.', photos: ['https://evil.example/x.jpg'] });
  assert.equal(bid.status, 400);
});

test('messages are private to the two people in the conversation', async () => {
  const dana = await t.as('dana@example.com'), marcus = await t.as('marcus@example.com'), kelly = await t.as('kelly@example.com'), priya = await t.as('priya@example.com');
  const marcusId = (await marcus.get('/api/session')).me.id, priyaId = (await priya.get('/api/session')).me.id;
  assert.equal((await dana.post('/api/conversations', { userId: priyaId })).status, 400, 'employers cannot message employers');
  const { id } = await dana.post('/api/conversations', { userId: marcusId });
  assert.equal((await dana.post('/api/conversations', { userId: marcusId })).id, id, 'one conversation per pair');
  await dana.post(`/api/conversations/${id}/messages`, { text: 'Hi Marcus, can you come Thursday?' });
  await dana.post(`/api/conversations/${id}/messages`, { text: 'Also bring a gasket please.' });
  assert.equal((await kelly.get('/api/conversations/' + id)).status, 404, 'outsiders cannot read it');
  assert.equal((await kelly.post(`/api/conversations/${id}/messages`, { text: 'hi' })).status, 404);
  const s = await marcus.get('/api/session');
  assert.ok(s.unread.conversations >= 1);
  const alerts = (await marcus.get('/api/notifications')).notifications.filter(n => n.type === 'message' && n.link === '#/messages/' + id && !n.read);
  assert.equal(alerts.length, 1, 'one unread alert per conversation');
  await marcus.post(`/api/conversations/${id}/read`);
  assert.equal((await marcus.get('/api/notifications')).notifications.filter(n => n.type === 'message' && n.link === '#/messages/' + id && !n.read).length, 0);
  assert.equal((await dana.post(`/api/conversations/${id}/messages`, { text: '   ' })).status, 400);
});

test('the health check reports the database', async () => {
  const r = await t.client().get('/api/health');
  assert.equal(r.status, 200); assert.equal(r.db, 'up');
});

test('uploaded photos are stored in the database and served with long-lived caching', async () => {
  const marcus = await t.as('marcus@example.com');
  const { url } = await marcus.post('/api/uploads', { dataUrl: TINY_PNG });
  const res = await fetch(t.base + url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.match(res.headers.get('cache-control'), /max-age=31536000, immutable/);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from(TINY_PNG.split(',')[1], 'base64'));
  assert.equal((await fetch(t.base + '/uploads/' + 'f'.repeat(32) + '.png')).status, 404);
  const huge = 'data:image/png;base64,' + 'A'.repeat(4.2 * 1024 * 1024);
  assert.equal((await marcus.post('/api/uploads', { dataUrl: huge })).status, 413, 'too large, rejected before decoding');
});

test('X-Forwarded-For is ignored outside production', async () => {
  const c = t.client();
  for (let i = 0; i < 11; i++) await c.raw('POST', '/api/auth/login', { email: 'ana@example.com', password: 'nope' }, { 'X-Forwarded-For': `10.0.0.${i}` });
  assert.equal((await c.raw('POST', '/api/auth/login', { email: 'ana@example.com', password: 'nope' }, { 'X-Forwarded-For': '10.9.9.9' })).status, 429, 'spoofed addresses do not reset the limit');
});
