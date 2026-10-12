/* Background jobs: notification emails (against a stand-in for Resend) and city lookups (against a stand-in for
   OpenStreetMap's Nominatim), so no real outside service is called. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startApp } from './helpers.js';

/* A local HTTP server that answers with `respond(req, body)` and records requests. */
async function standIn(respond) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; });
    req.on('end', () => { calls.push({ url: req.url, headers: req.headers, body: b ? JSON.parse(b) : null }); const [status, data] = respond(req, b); res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => server.close() };
}

let t, resend, nominatim, resendStatus = 200;
before(async () => {
  resend = await standIn(() => [resendStatus, { id: 'x' }]);
  nominatim = await standIn(req => /dallas/i.test(req.url) ? [200, [{ lat: '32.7767', lon: '-96.7970', address: { city: 'Dallas', 'ISO3166-2-lvl4': 'US-TX' } }]] : [200, []]);
  t = await startApp({ RESEND_API_KEY: 'test-key', EMAIL_FROM: 'Nearhand <test@example.com>', RESEND_API_URL: resend.url + '/emails', GEOCODER_URL: nominatim.url + '/search' });
});
after(async () => { await t.stop(); resend.close(); nominatim.close(); });

const latestNotification = (email, type) => t.app.db.get('SELECT n.* FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = ? AND n.type = ? ORDER BY n.id DESC LIMIT 1', email, type);

test('notification emails are sent, and switched-off types are skipped', async () => {
  const dana = await t.as('dana@example.com'), marcus = await t.as('marcus@example.com');
  const jobId = t.app.db.get("SELECT id FROM jobs WHERE title LIKE 'Replace kitchen faucet%'").id;
  await marcus.post(`/api/jobs/${jobId}/bids`, { price: 170, message: 'Revised: I can do it for a little less this week.' });
  await t.app.queue.drain();
  assert.equal(latestNotification('dana@example.com', 'bid').email_status, 'sent');
  const sent = resend.calls.at(-1);
  assert.equal(sent.headers.authorization, 'Bearer test-key');
  assert.deepEqual(sent.body.to, ['dana@example.com']);
  assert.match(sent.body.html, /Open in Nearhand/);

  const me = (await dana.get('/api/session')).me;
  await dana.put('/api/settings', { name: me.name, phone: me.phone, location: me.location, about: 'x', emailPrefs: ['progress', 'review'] });
  await marcus.post(`/api/jobs/${jobId}/bids`, { price: 165, message: 'One more revision, final price for this job.' });
  const calls = resend.calls.length;
  await t.app.queue.drain();
  assert.equal(resend.calls.length, calls, 'no email sent');
  assert.equal(latestNotification('dana@example.com', 'bid').email_status, 'skipped');
});

test('refused emails fail without retrying; outages are retried', async () => {
  const marcus = await t.as('marcus@example.com');
  const jobId = t.app.db.get("SELECT id FROM jobs WHERE title LIKE 'Move-out deep clean%'").id;
  resendStatus = 403;
  await marcus.post(`/api/jobs/${jobId}/bids`, { price: 250, message: 'I can clean the whole apartment in one long day.' });
  await t.app.queue.drain();
  assert.equal(latestNotification('priya@example.com', 'bid').email_status, 'failed');
  resendStatus = 503;
  await marcus.post(`/api/jobs/${jobId}/bids`, { price: 240, message: 'Lowered my price after checking my schedule.' });
  await t.app.queue.drain();
  const job = t.app.db.get("SELECT * FROM queue WHERE kind = 'email' ORDER BY id DESC LIMIT 1");
  assert.equal(job.status, 'pending', 'will be retried'); assert.equal(job.attempts, 1);
  assert.ok(job.run_at > Date.now(), 'after a delay');
  resendStatus = 200;
});

test('new cities are looked up in the background and placed on the map', async () => {
  const dana = await t.as('dana@example.com');
  const r = await dana.post('/api/jobs', { title: 'Pressure wash driveway', category: 'cleaning', location: 'dallas texas', experience: '0–2 years', budgetMin: 80, budgetMax: 160,
    description: 'Pressure wash a two-car driveway and the front walk.' });
  assert.equal(r.ok, true, r.error);
  assert.equal((await dana.get('/api/jobs/' + r.id)).job.coords, null, 'not placed yet');
  await t.app.queue.drain();
  const job = (await dana.get('/api/jobs/' + r.id)).job;
  assert.equal(job.location, 'Dallas, TX'); assert.ok(job.coords);
  assert.ok((await dana.get('/api/cities')).cities.includes('Dallas, TX'));

  const bad = await dana.post('/api/jobs', { title: 'Mystery job', category: 'cleaning', location: 'Zzyzxqtown, TX', experience: '0–2 years', budgetMin: 80, budgetMax: 160,
    description: 'This city does not exist anywhere at all.' });
  await t.app.queue.drain();
  assert.match(latestNotification('dana@example.com', 'location').title, /Zzyzxqtown/);
  assert.equal((await dana.get('/api/jobs/' + bad.id)).job.coords, null);
});
