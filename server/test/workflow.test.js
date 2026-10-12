/* The full job workflow through the API: post, bid with a photo, counter, hire, fund, work, approve, review. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, TINY_PNG } from './helpers.js';

let t, dana, marcus;
before(async () => { t = await startApp(); dana = await t.as('dana@example.com'); marcus = await t.as('marcus@example.com'); });
after(() => t.stop());

test('a job goes from posting to reviews', async () => {
  const posted = await dana.post('/api/jobs', { title: 'Replace bathroom fan', category: '__new', newCategory: 'Ventilation', location: 'round rock tx', experience: '3–5 years',
    budgetMin: 100, budgetMax: 200, description: 'The bathroom exhaust fan is loud and barely moves air. Replace it with a quiet one.', schedStart: '2026-11-03', schedTime: '10:00', schedRepeat: 'none' });
  assert.equal(posted.ok, true, posted.error);
  const jobId = posted.id;

  const job = await dana.get('/api/jobs/' + jobId);
  assert.equal(job.job.location, 'Round Rock, TX', 'known city normalized');
  assert.ok(job.job.coords, 'known city placed on the map');
  assert.equal(job.category.name, 'Ventilation', 'new category created');
  assert.deepEqual(job.bids, []);

  const upload = await marcus.post('/api/uploads', { dataUrl: TINY_PNG });
  assert.match(upload.url, /^\/uploads\/[a-f0-9]{32}\.png$/);
  const bid = await marcus.post(`/api/jobs/${jobId}/bids`, { price: 180, message: 'I install bathroom fans regularly and can do this in one visit.', photos: [upload.url] });
  assert.equal(bid.ok, true, bid.error);

  const withBid = await dana.get('/api/jobs/' + jobId);
  assert.equal(withBid.bids.length, 1);
  assert.deepEqual(withBid.bids[0].photos, [upload.url]);
  const bidId = withBid.bids[0].id;

  assert.equal((await dana.post(`/api/bids/${bidId}/counter`, { price: 160, note: 'Could you do 160?' })).ok, true);
  assert.equal((await marcus.post(`/api/bids/${bidId}/respond`, { accept: true })).ok, true);
  assert.equal((await dana.post(`/api/bids/${bidId}/hire`)).ok, true);
  for (const [who, step] of [[dana, 'fund'], [marcus, 'start'], [marcus, 'complete'], [dana, 'confirm']]) {
    const r = await who.post(`/api/jobs/${jobId}/${step}`, { note: 'All done' });
    assert.equal(r.ok, true, `${step}: ${r.error}`);
  }
  const done = await marcus.get('/api/jobs/' + jobId);
  assert.equal(done.job.status, 'Completed');
  assert.equal(done.job.agreedPrice, 160, 'counter-offer price was agreed');
  assert.equal(done.transaction.status, 'released');
  assert.equal(done.canReview, true);

  assert.equal((await dana.post(`/api/jobs/${jobId}/reviews`, { rating: 5, text: 'Quiet fan, tidy work, great communication.' })).ok, true);
  assert.equal((await marcus.post(`/api/jobs/${jobId}/reviews`, { rating: 5, text: 'Clear instructions and easy access.' })).ok, true);
  const again = await marcus.post(`/api/jobs/${jobId}/reviews`, { rating: 1, text: 'Trying to review twice here.' });
  assert.equal(again.status, 400);

  const types = (await marcus.get('/api/notifications')).notifications.map(n => n.type);
  for (const type of ['counter', 'hired', 'funded', 'paid', 'review']) assert.ok(types.includes(type), `worker got a ${type} notification`);
  const employerTypes = (await dana.get('/api/notifications')).notifications.map(n => n.type);
  for (const type of ['bid', 'counter', 'progress', 'review']) assert.ok(employerTypes.includes(type), `employer got a ${type} notification`);

  const payments = await marcus.get('/api/payments');
  assert.ok(payments.transactions.some(tx => tx.jobId === jobId && tx.status === 'released' && tx.amount === 160));
});

test('the dashboard lists jobs and to-dos for each role', async () => {
  const d = await dana.get('/api/dashboard');
  assert.equal(d.role, 'employer');
  assert.ok(d.jobs.length > 5);
  assert.ok(d.todos.some(t => t.label === 'Review and approve'), 'seeded job awaiting approval appears as a to-do');
  const m = await marcus.get('/api/dashboard');
  assert.equal(m.role, 'worker');
  assert.ok(m.stats.completed >= 3);
});

test('browsing jobs filters by keyword, category, distance and budget', async () => {
  const all = await marcus.get('/api/jobs');
  assert.ok(all.jobs.length >= 10);
  assert.ok(all.jobs.every(j => j.status === 'Open for Bids'));
  const paint = await marcus.get('/api/jobs?cat=paint');
  assert.ok(paint.jobs.length >= 1 && paint.jobs.every(j => j.category === 'painting'));
  const near = await marcus.get('/api/jobs?radius=5&sort=near');
  assert.ok(near.jobs.every(j => j.distance <= 5));
  assert.ok(near.jobs.length < all.jobs.length, 'radius narrows the list');
  const cheap = await marcus.get('/api/jobs?max=150');
  assert.ok(cheap.jobs.every(j => j.budgetMin <= 150));
  const words = await marcus.get('/api/jobs?q=faucet%20drain');
  assert.ok(words.jobs.length >= 1 && words.jobs.every(j => /faucet/i.test(j.title + j.description)));
});

test('a double-submitted action only happens once', async () => {
  const posted = await dana.post('/api/jobs', { title: 'Fix squeaky door', category: 'handyman', location: 'Austin, TX', experience: '0–2 years', budgetMin: 40, budgetMax: 80,
    description: 'One interior door squeaks loudly. Oil or replace the hinges.' });
  assert.equal(posted.ok, true, posted.error);
  await marcus.post(`/api/jobs/${posted.id}/bids`, { price: 60, message: 'Quick fix, I have hinges in the van already.' });
  const bidId = (await dana.get('/api/jobs/' + posted.id)).bids[0].id;
  const results = await Promise.all([dana.post(`/api/bids/${bidId}/hire`), dana.post(`/api/bids/${bidId}/hire`)]);
  assert.equal(results.filter(r => r.ok).length, 1, 'exactly one hire succeeds');
  const funded = await Promise.all([dana.post(`/api/jobs/${posted.id}/fund`), dana.post(`/api/jobs/${posted.id}/fund`)]);
  assert.equal(funded.filter(r => r.ok).length, 1, 'escrow is funded once');
  const job = await dana.get('/api/jobs/' + posted.id);
  assert.equal(job.job.history.filter(h => h.status === 'Worker Selected').length, 1);
  assert.equal(job.transaction.events.length, 1);
});
