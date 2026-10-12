/* Jobs: browsing, posting and editing, bids and counter-offers, hiring, escrow, completion, reviews,
   plus the dashboard and payment history built from them. Each read returns only what the viewer may see. */
import { STATUSES, EXPERIENCE } from '../../shared/constants.js';
import { readSchedule } from '../../shared/schedule.js';
import { money, milesBetween, first } from '../../shared/format.js';
import { fail, notFound } from '../lib/errors.js';
import { now, json, coordsOf, txLabel, requireUser, notify, userSummary, userSummaries, resolveCategory, placeIn, categoryMatcher } from './common.js';

const OPEN = STATUSES[0];
const IN_FLIGHT = ['Worker Selected', 'Payment Funded', 'In Progress', 'Awaiting Approval'];

const toJob = r => ({
  id: r.id, employerId: r.employer_id, title: r.title, description: r.description, category: r.category_id, location: r.location,
  coords: coordsOf(r), experience: r.experience, budgetMin: r.budget_min, budgetMax: r.budget_max, schedule: json(r.schedule, null),
  status: r.status, workerId: r.worker_id, agreedPrice: r.agreed_price, completionNote: r.completion_note, createdAt: r.created_at
});

export function createJobs(ctx) {
  const { db } = ctx;
  const jobRow = id => db.get('SELECT * FROM jobs WHERE id = ?', Number(id));
  const bidRow = id => db.get('SELECT * FROM bids WHERE id = ?', Number(id));
  /* Moves a job from one status to the next. The status check is part of the update, so if two requests race (a
     double-clicked button), only the first succeeds and the other's transaction is rolled back. */
  const advance = async (jobId, from, to) => {
    if (!(await db.run('UPDATE jobs SET status = ? WHERE id = ? AND status = ?', to, jobId, from)).changes) fail('This job was just updated. Reload the page and try again.', 409);
    await db.run('INSERT INTO job_history (job_id, status, at) VALUES (?, ?, ?)', jobId, to, now());
  };
  /* All categories by id (one query), with a fallback for unknown ids. */
  const categoryLookup = async () => {
    const all = new Map((await db.all('SELECT id, name, icon FROM categories')).map(c => [c.id, c]));
    return id => all.get(id) || { id, name: 'Other', icon: '' };
  };
  const category = async id => (await categoryLookup())(id);
  const link = id => '#/job/' + id;
  /* Tells everyone involved in a job (employer, hired worker, bidders) that it changed, so open pages can refresh. */
  const changed = async jobId => {
    const j = await jobRow(jobId); if (!j) return;
    const ids = new Set([j.employer_id, j.worker_id, ...(await db.all('SELECT worker_id FROM bids WHERE job_id = ?', jobId)).map(b => b.worker_id)]);
    for (const id of ids) if (id) ctx.events.emit(id, { type: 'job', jobId: j.id });
  };

  /* Bids with their photos and negotiation history. */
  async function loadBids(where, ...params) {
    const bids = await db.all(`SELECT b.*, wp.hourly_rate FROM bids b LEFT JOIN worker_profiles wp ON wp.user_id = b.worker_id WHERE ${where}`, ...params);
    if (!bids.length) return [];
    const ids = bids.map(b => b.id), marks = ids.map(() => '?').join(',');
    const photos = await db.all(`SELECT bid_id, url FROM bid_photos WHERE bid_id IN (${marks}) ORDER BY position`, ...ids);
    const history = await db.all(`SELECT bid_id, type, price, at FROM bid_history WHERE bid_id IN (${marks}) ORDER BY at, rowid`, ...ids);
    return bids.map(b => ({
      id: b.id, jobId: b.job_id, workerId: b.worker_id, price: b.price, message: b.message, status: b.status, hourlyRate: b.hourly_rate || 0,
      counter: b.counter_status ? { price: b.counter_price, note: b.counter_note || '', status: b.counter_status, at: b.counter_at } : null,
      photos: photos.filter(p => p.bid_id === b.id).map(p => p.url),
      history: history.filter(h => h.bid_id === b.id).map(({ type, price, at }) => ({ type, price, at })), createdAt: b.created_at
    }));
  }
  async function transactionFor(jobId) {
    const t = await db.get('SELECT * FROM transactions WHERE job_id = ?', jobId); if (!t) return null;
    return { id: txLabel(t.id), amount: t.amount, fee: t.fee, status: t.status, card: t.card, createdAt: t.created_at,
      events: await db.all('SELECT type, at FROM transaction_events WHERE transaction_id = ? ORDER BY at, rowid', t.id) };
  }
  async function reviewsWhere(where, ...params) {
    const rows = await db.all(`SELECT r.*, j.title AS job_title, j.employer_id AS job_employer FROM reviews r JOIN jobs j ON j.id = r.job_id WHERE ${where} ORDER BY r.created_at DESC`, ...params);
    const users = await userSummaries(db, rows.map(r => r.from_id));
    return rows.map(r => ({ id: r.id, jobId: r.job_id, jobTitle: r.job_title, jobEmployerId: r.job_employer, rating: r.rating, text: r.text, createdAt: r.created_at, from: users.get(r.from_id) }));
  }
  const viewable = (viewer, j) => viewer.role === 'worker' || j.employer_id === viewer.id;

  return {
    reviewsWhere, viewable,

    /* Open jobs for workers, filtered and sorted. f: { q, cat, city, radius, min, max, sort } */
    async listOpen(session, f = {}) {
      const viewer = await requireUser(db, session, 'worker');
      const where = ['j.status = ?'], params = [OPEN];
      for (const w of String(f.q || '').toLowerCase().split(/\s+/).filter(Boolean)) { where.push("lower(j.title || ' ' || j.description || ' ' || c.name || ' ' || j.location) LIKE ?"); params.push(`%${w}%`); }
      if (f.city) { where.push('j.location = ?'); params.push(f.city); }
      if (f.min !== undefined && f.min !== '') { where.push('j.budget_max >= ?'); params.push(Number(f.min)); }
      if (f.max !== undefined && f.max !== '') { where.push('j.budget_min <= ?'); params.push(Number(f.max)); }
      const rows = await db.all(`SELECT j.*, (SELECT COUNT(*) FROM bids b WHERE b.job_id = j.id AND b.status = 'active') AS bid_count
        FROM jobs j JOIN categories c ON c.id = j.category_id WHERE ${where.join(' AND ')} ORDER BY j.created_at DESC`, ...params);
      const matchCat = await categoryMatcher(db, f.cat), here = coordsOf(viewer), radius = Number(f.radius) || 0;
      let list = rows.filter(r => matchCat(r.category_id)).map(r => ({ ...toJob(r), bidCount: r.bid_count, distance: milesBetween(here, coordsOf(r)) }));
      if (radius) list = list.filter(j => j.distance <= radius);
      const employers = await userSummaries(db, list.map(j => j.employerId)), cat = await categoryLookup();
      list.forEach(j => { j.employer = employers.get(j.employerId); j.categoryName = cat(j.category).name; j.categoryIcon = cat(j.category).icon; });
      const s = f.sort;
      list.sort((a, b) => s === 'budget' ? b.budgetMax - a.budgetMax
        : s === 'bids' ? a.bidCount - b.bidCount
        : s === 'near' ? (a.distance === b.distance ? b.createdAt - a.createdAt : a.distance - b.distance)
        : s === 'employer' ? b.employer.rating.avg - a.employer.rating.avg || b.employer.rating.n - a.employer.rating.n
        : b.createdAt - a.createdAt);
      return { jobs: list.map(j => ({ ...j, distance: Number.isFinite(j.distance) ? j.distance : null })) };
    },

    /* One job, with what this viewer is allowed to see: bids for the owner, your own bid for a worker, the
       agreement and escrow for the two people on the job, and reviews once it's completed. */
    async get(session, id) {
      const viewer = await requireUser(db, session), r = await jobRow(id);
      if (!r || !viewable(viewer, r)) notFound('That job');
      const job = { ...toJob(r), history: await db.all('SELECT status, at FROM job_history WHERE job_id = ? ORDER BY at, rowid', r.id) };
      const isOwner = r.employer_id === viewer.id, isHired = r.worker_id === viewer.id;
      const out = { job, category: await category(r.category_id), employer: await userSummary(db, r.employer_id), isOwner, isHired, distance: null };
      if (viewer.role === 'worker') { const d = milesBetween(coordsOf(viewer), coordsOf(r)); out.distance = Number.isFinite(d) ? d : null; }
      if (isOwner) {
        out.bids = await loadBids("b.job_id = ? AND b.status != 'withdrawn'", r.id);
        const workers = await userSummaries(db, out.bids.map(b => b.workerId));
        out.bids.forEach(b => { b.worker = workers.get(b.workerId); });
      } else if (viewer.role === 'worker') {
        out.myBid = (await loadBids('b.job_id = ? AND b.worker_id = ?', r.id, viewer.id))[0] || null;
      }
      if (r.worker_id && (isOwner || isHired)) { out.worker = await userSummary(db, r.worker_id); out.transaction = await transactionFor(r.id); }
      if (r.status === 'Completed') {
        out.reviews = await reviewsWhere('r.job_id = ?', r.id);
        if (isOwner || isHired) out.canReview = !out.reviews.some(x => x.from.id === viewer.id);
      }
      return out;
    },

    /* Creates (no id) or edits an open job. d: form fields including the schedule fields. */
    async save(session, id, d) {
      const viewer = await requireUser(db, session, 'employer');
      const title = String(d.title || '').trim(), desc = String(d.description || '').trim();
      const min = Number(d.budgetMin), max = Number(d.budgetMax);
      if (!title) fail('Add a job title.');
      if (!d.category) fail('Choose a category.');
      if (desc.length < 20) fail('Describe the work in at least 20 characters so workers can bid accurately.');
      if (!String(d.location || '').trim()) fail('Add the job location.');
      if (!(min > 0) || !(max > 0)) fail('Enter a budget minimum and maximum.');
      if (min > max) fail('Budget minimum cannot be higher than the maximum.');
      if (!EXPERIENCE.includes(d.experience)) fail('Choose the experience required.');
      const sch = readSchedule(d); if (!sch.ok) fail(sch.error);
      let existing = null;
      if (id) {
        existing = await jobRow(id);
        if (!existing || existing.employer_id !== viewer.id) fail('You can only edit your own jobs.', 403);
        if (existing.status !== OPEN) fail('Jobs can only be edited while they are open for bids.');
      }
      const saved = await db.tx(async () => {
        const cat = await resolveCategory(db, d, viewer.id); // last, so a rejected form leaves no stray category
        const schedule = sch.value ? JSON.stringify(sch.value) : null;
        if (existing) {
          const moved = existing.location !== String(d.location).trim();
          const place = moved ? await placeIn(db, d.location, 'job' + existing.id) : { location: existing.location, lat: existing.lat, lon: existing.lon, known: true };
          const edited = await db.run(`UPDATE jobs SET title = ?, description = ?, category_id = ?, location = ?, lat = ?, lon = ?, experience = ?, budget_min = ?, budget_max = ?, schedule = ? WHERE id = ? AND status = ?`,
            title, desc, cat, place.location, place.lat, place.lon, d.experience, min, max, schedule, existing.id, OPEN);
          if (!edited.changes) fail('Jobs can only be edited while they are open for bids.');
          if (!place.known) await ctx.queue.add('geocode', { location: place.location });
          return existing.id;
        }
        const jobId = await db.insert(`INSERT INTO jobs (employer_id, title, description, category_id, location, experience, budget_min, budget_max, schedule, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, viewer.id, title, desc, cat, String(d.location).trim(), d.experience, min, max, schedule, OPEN, now());
        const place = await placeIn(db, d.location, 'job' + jobId);
        await db.run('UPDATE jobs SET location = ?, lat = ?, lon = ? WHERE id = ?', place.location, place.lat, place.lon, jobId);
        await db.run('INSERT INTO job_history (job_id, status, at) VALUES (?, ?, ?)', jobId, OPEN, now());
        if (!place.known) await ctx.queue.add('geocode', { location: place.location });
        return jobId;
      });
      if (existing) await changed(saved);
      return { ok: true, id: saved };
    },

    async remove(session, id) {
      const viewer = await requireUser(db, session), j = await jobRow(id);
      if (!j || j.employer_id !== viewer.id) fail('You can only remove your own jobs.', 403);
      if (j.status !== OPEN) fail('Jobs that already have a hired worker cannot be removed.');
      await db.tx(async () => {
        for (const b of await db.all("SELECT worker_id FROM bids WHERE job_id = ? AND status = 'active'", j.id)) await notify(ctx, b.worker_id, 'job', `"${j.title}" was removed`, 'The employer removed this job, so your bid is closed.', '#/jobs');
        if (!(await db.run('DELETE FROM jobs WHERE id = ? AND status = ?', j.id, OPEN)).changes) fail('Jobs that already have a hired worker cannot be removed.');
      });
      return { ok: true };
    },

    /* Places or revises the worker's bid. d: { price, message, photos: [upload URLs] } */
    async bid(session, jobId, d) {
      const viewer = await requireUser(db, session, 'worker'), j = await jobRow(jobId);
      if (!j || j.status !== OPEN) fail('This job is no longer accepting bids.');
      const price = Number(d.price), message = String(d.message || '').trim();
      if (!(price > 0)) fail('Enter your price.');
      if (message.length < 20) fail('Tell the employer why you are a good fit (at least 20 characters).');
      const photos = [].concat(d.photos || []).slice(0, 4);
      if (photos.some(p => !ctx.storage.isUploadUrl(p))) fail('Upload photos with the photo picker.');
      await db.tx(async () => {
        let b = await db.get('SELECT * FROM bids WHERE job_id = ? AND worker_id = ?', j.id, viewer.id), revised = !!b;
        if (b) {
          await db.run(`UPDATE bids SET price = ?, message = ?, status = 'active', counter_status = CASE WHEN counter_status = 'pending' THEN 'declined' ELSE counter_status END WHERE id = ?`, price, message, b.id);
          await db.run('INSERT INTO bid_history (bid_id, type, price, at) VALUES (?, ?, ?, ?)', b.id, 'revised', price, now());
        } else {
          b = { id: await db.insert("INSERT INTO bids (job_id, worker_id, price, message, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)", j.id, viewer.id, price, message, now()) };
          await db.run('INSERT INTO bid_history (bid_id, type, price, at) VALUES (?, ?, ?, ?)', b.id, 'bid', price, now());
        }
        await db.run('DELETE FROM bid_photos WHERE bid_id = ?', b.id);
        for (const [i, url] of photos.entries()) await db.run('INSERT INTO bid_photos (bid_id, position, url) VALUES (?, ?, ?)', b.id, i, url);
        await notify(ctx, j.employer_id, 'bid', revised ? `${viewer.name} revised their bid` : `New bid on "${j.title}"`,
          revised ? `New price for "${j.title}": ${money(price)}.` : `${viewer.name} bid ${money(price)}: "${message.slice(0, 140)}${message.length > 140 ? '…' : ''}"`, link(j.id));
      });
      await changed(j.id);
      return { ok: true };
    },

    async withdraw(session, bidId) {
      const viewer = await requireUser(db, session), b = await bidRow(bidId), j = b && await jobRow(b.job_id);
      if (!b || b.worker_id !== viewer.id) notFound('That bid');
      if (j.status !== OPEN) fail('Bids can only be withdrawn while the job is open.');
      await db.tx(async () => {
        await db.run("UPDATE bids SET status = 'withdrawn' WHERE id = ?", b.id);
        await db.run('INSERT INTO bid_history (bid_id, type, price, at) VALUES (?, ?, ?, ?)', b.id, 'withdrawn', b.price, now());
        await notify(ctx, j.employer_id, 'bid', `${viewer.name} withdrew their bid`, `Their bid on "${j.title}" is no longer active.`, link(j.id));
      });
      await changed(j.id);
      return { ok: true };
    },

    async counter(session, bidId, price, note) {
      const viewer = await requireUser(db, session), b = await bidRow(bidId), j = b && await jobRow(b.job_id);
      if (!b || j.employer_id !== viewer.id) fail('Only the job owner can counter.', 403);
      if (j.status !== OPEN || b.status !== 'active') fail('This bid can no longer be negotiated.');
      price = Number(price); if (!(price > 0)) fail('Enter a counter-offer price.');
      note = String(note || '').trim();
      await db.tx(async () => {
        await db.run("UPDATE bids SET counter_price = ?, counter_note = ?, counter_status = 'pending', counter_at = ? WHERE id = ?", price, note, now(), b.id);
        await db.run('INSERT INTO bid_history (bid_id, type, price, at) VALUES (?, ?, ?, ?)', b.id, 'counter', price, now());
        await notify(ctx, b.worker_id, 'counter', `Counter-offer on "${j.title}"`, `${viewer.name} offered ${money(price)} instead of your ${money(b.price)}.${note ? ` Note: "${note}"` : ''}`, link(j.id));
      });
      await changed(j.id);
      return { ok: true };
    },

    async respondCounter(session, bidId, accept) {
      const viewer = await requireUser(db, session), b = await bidRow(bidId);
      if (!b || b.worker_id !== viewer.id || b.counter_status !== 'pending') fail('No counter-offer to answer.');
      const j = await jobRow(b.job_id), price = accept ? b.counter_price : b.price;
      await db.tx(async () => {
        if (!(await db.run("UPDATE bids SET price = ?, counter_status = ? WHERE id = ? AND counter_status = 'pending'", price, accept ? 'accepted' : 'declined', b.id)).changes) fail('No counter-offer to answer.');
        await db.run('INSERT INTO bid_history (bid_id, type, price, at) VALUES (?, ?, ?, ?)', b.id, accept ? 'accepted-counter' : 'declined-counter', price, now());
        await notify(ctx, j.employer_id, 'counter', `${viewer.name} ${accept ? 'accepted' : 'declined'} your counter-offer`,
          accept ? `They will do "${j.title}" for ${money(price)}. You can hire them now.` : `Their bid on "${j.title}" stays at ${money(price)}.`, link(j.id));
      });
      await changed(j.id);
      return { ok: true };
    },

    async hire(session, bidId) {
      const viewer = await requireUser(db, session), b = await bidRow(bidId), j = b && await jobRow(b.job_id);
      if (!b || j.employer_id !== viewer.id) fail('Only the job owner can hire.', 403);
      if (j.status !== OPEN || b.status !== 'active') fail('This job is no longer open.');
      await db.tx(async () => {
        await advance(j.id, OPEN, 'Worker Selected');
        for (const other of await db.all("SELECT worker_id FROM bids WHERE job_id = ? AND id != ? AND status = 'active'", j.id, b.id)) {
          await notify(ctx, other.worker_id, 'hired', `Another worker was chosen for "${j.title}"`, 'Thanks for bidding. Keep an eye out for new jobs near you.', '#/jobs');
        }
        await db.run("UPDATE bids SET status = 'rejected' WHERE job_id = ? AND id != ? AND status = 'active'", j.id, b.id);
        if (!(await db.run("UPDATE bids SET status = 'accepted' WHERE id = ? AND status = 'active'", b.id)).changes) fail('This bid was just withdrawn.', 409);
        await db.run('UPDATE jobs SET worker_id = ?, agreed_price = ? WHERE id = ?', b.worker_id, b.price, j.id);
        await notify(ctx, b.worker_id, 'hired', `You're hired for "${j.title}"`, `${viewer.name} accepted your bid of ${money(b.price)}. You can start once they fund escrow.`, link(j.id));
      });
      await changed(j.id);
      return { ok: true };
    },

    async fund(session, jobId) {
      const viewer = await requireUser(db, session), j = await jobRow(jobId);
      if (!j || j.employer_id !== viewer.id) fail('Only the job owner can fund the job.', 403);
      if (j.status !== 'Worker Selected') fail('Escrow can be funded after a worker is selected.');
      await db.tx(async () => {
        await advance(j.id, 'Worker Selected', 'Payment Funded');
        const t = await db.insert("INSERT INTO transactions (job_id, employer_id, worker_id, amount, fee, status, card, created_at) VALUES (?, ?, ?, ?, 0, 'held', 'Visa •••• 4242', ?)", j.id, viewer.id, j.worker_id, j.agreed_price, now());
        await db.run("INSERT INTO transaction_events (transaction_id, type, at) VALUES (?, 'funded', ?)", t, now());
        await notify(ctx, j.worker_id, 'funded', `Escrow funded for "${j.title}"`, `${money(j.agreed_price)} is held in escrow. You can start the work.`, link(j.id));
      });
      await changed(j.id);
      return { ok: true };
    },

    async start(session, jobId) {
      const viewer = await requireUser(db, session), j = await jobRow(jobId);
      if (!j || j.worker_id !== viewer.id) fail('Only the hired worker can start the job.', 403);
      if (j.status !== 'Payment Funded') fail('Work can start once escrow is funded.');
      await db.tx(async () => {
        await advance(j.id, 'Payment Funded', 'In Progress');
        await notify(ctx, j.employer_id, 'progress', `Work started on "${j.title}"`, `${viewer.name} has started the job.`, link(j.id));
      });
      await changed(j.id);
      return { ok: true };
    },

    async complete(session, jobId, note) {
      const viewer = await requireUser(db, session), j = await jobRow(jobId);
      if (!j || j.worker_id !== viewer.id) fail('Only the hired worker can mark the job complete.', 403);
      if (j.status !== 'In Progress') fail('The job must be in progress first.');
      await db.tx(async () => {
        await advance(j.id, 'In Progress', 'Awaiting Approval');
        await db.run('UPDATE jobs SET completion_note = ? WHERE id = ?', String(note || '').trim(), j.id);
        await notify(ctx, j.employer_id, 'progress', `Approval needed: "${j.title}"`, `${viewer.name} marked the work complete. Review it and release ${money(j.agreed_price)} from escrow.`, link(j.id));
      });
      await changed(j.id);
      return { ok: true };
    },

    async confirm(session, jobId) {
      const viewer = await requireUser(db, session), j = await jobRow(jobId);
      if (!j || j.employer_id !== viewer.id) fail('Only the job owner can confirm completion.', 403);
      if (j.status !== 'Awaiting Approval') fail('The worker has not marked this job complete yet.');
      await db.tx(async () => {
        await advance(j.id, 'Awaiting Approval', 'Completed');
        const t = await db.get('SELECT id FROM transactions WHERE job_id = ?', j.id);
        if (t) { await db.run("UPDATE transactions SET status = 'released' WHERE id = ?", t.id); await db.run("INSERT INTO transaction_events (transaction_id, type, at) VALUES (?, 'released', ?)", t.id, now()); }
        await notify(ctx, j.worker_id, 'paid', `Payment released for "${j.title}"`, `${viewer.name} approved the work and ${money(j.agreed_price)} was released to you.`, '#/payments');
      });
      await changed(j.id);
      return { ok: true };
    },

    async review(session, jobId, rating, text) {
      const viewer = await requireUser(db, session), j = await jobRow(jobId);
      if (!j || j.status !== 'Completed') fail('Reviews open once a job is completed.');
      if (viewer.id !== j.employer_id && viewer.id !== j.worker_id) fail('Only the employer and worker on this job can review it.', 403);
      if (await db.get('SELECT 1 FROM reviews WHERE job_id = ? AND from_id = ?', j.id, viewer.id)) fail('You already reviewed this job.');
      rating = Number(rating); if (!(rating >= 1 && rating <= 5)) fail('Choose a star rating from 1 to 5.');
      text = String(text || '').trim(); if (text.length < 10) fail('Write at least a sentence (10 characters) so the review is useful.');
      const toId = viewer.id === j.employer_id ? j.worker_id : j.employer_id;
      await db.tx(async () => {
        await db.insert('INSERT INTO reviews (job_id, from_id, to_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)', j.id, viewer.id, toId, Math.round(rating), text, now());
        await notify(ctx, toId, 'review', `${viewer.name} left you a ${Math.round(rating)}-star review`, `"${text.slice(0, 160)}"`, '#/profile/' + toId);
      });
      await changed(j.id);
      return { ok: true };
    },

    /* Dashboard lists, stats and to-dos for the signed-in user. */
    async dashboard(session) {
      const viewer = await requireUser(db, session);
      const todo = (strong, text, href, label, primary = true) => ({ strong, text, href, label, primary });
      if (viewer.role === 'employer') {
        const jobs = await db.all(`SELECT j.*, (SELECT COUNT(*) FROM bids b WHERE b.job_id = j.id AND b.status = 'active') AS bid_count,
          (SELECT 1 FROM reviews r WHERE r.job_id = j.id AND r.from_id = ?) AS reviewed FROM jobs j WHERE j.employer_id = ? ORDER BY j.created_at DESC`, viewer.id, viewer.id);
        const workers = await userSummaries(db, jobs.map(j => j.worker_id)), cat = await categoryLookup();
        const list = jobs.map(r => ({ ...toJob(r), bidCount: r.bid_count, categoryName: cat(r.category_id).name, worker: r.worker_id ? { id: r.worker_id, name: workers.get(r.worker_id).name } : null, reviewed: !!r.reviewed }));
        const held = (await db.get("SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE employer_id = ? AND status = 'held'", viewer.id)).s;
        const todos = [
          ...list.filter(j => j.status === 'Worker Selected').map(j => todo(j.title, `: ${first(j.worker.name)} is selected. Fund escrow to start.`, link(j.id), 'Fund escrow')),
          ...list.filter(j => j.status === 'Awaiting Approval').map(j => todo(j.title, `: ${first(j.worker.name)} marked the work complete.`, link(j.id), 'Review and approve')),
          ...list.filter(j => j.status === 'Completed' && !j.reviewed).map(j => todo(j.title, ' is complete. Share how it went.', link(j.id), 'Leave a review', false))
        ];
        return { role: 'employer', jobs: list, todos, stats: { open: list.filter(j => j.status === OPEN).length, inFlight: list.filter(j => IN_FLIGHT.includes(j.status)).length, completed: list.filter(j => j.status === 'Completed').length, held } };
      }
      const jobs = await db.all('SELECT j.*, (SELECT 1 FROM reviews r WHERE r.job_id = j.id AND r.from_id = ?) AS reviewed FROM jobs j WHERE j.worker_id = ? ORDER BY j.created_at DESC', viewer.id, viewer.id);
      const bids = await db.all(`SELECT b.*, j.title, j.location, j.status AS job_status, j.employer_id FROM bids b JOIN jobs j ON j.id = b.job_id
        WHERE b.worker_id = ? AND b.status IN ('active', 'rejected', 'withdrawn') ORDER BY b.created_at DESC`, viewer.id);
      const people = await userSummaries(db, [...jobs.map(j => j.employer_id), ...bids.map(b => b.employer_id)]);
      const p = await db.get('SELECT * FROM worker_profiles WHERE user_id = ?', viewer.id) || {};
      const complete = !!(p.headline && p.bio && json(p.skills, []).length && p.hourly_rate);
      const sum = async status => (await db.get('SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE worker_id = ? AND status = ?', viewer.id, status)).s;
      const jobList = jobs.map(r => ({ ...toJob(r), employer: { id: r.employer_id, name: people.get(r.employer_id).name }, reviewed: !!r.reviewed }));
      const bidList = bids.map(b => ({ id: b.id, jobId: b.job_id, title: b.title, location: b.location, jobStatus: b.job_status, price: b.price, status: b.status, createdAt: b.created_at,
        counterPending: b.counter_status === 'pending', counterPrice: b.counter_price, employer: { id: b.employer_id, name: people.get(b.employer_id).name } }));
      const todos = [
        ...(complete ? [] : [todo('Finish your profile.', ' Employers check your bio, skills and pricing before hiring.', '#/settings', 'Edit profile')]),
        ...bidList.filter(b => b.status === 'active' && b.counterPending).map(b => todo(b.title, `: ${first(b.employer.name)} countered at ${money(b.counterPrice)}.`, link(b.jobId), 'Respond')),
        ...jobList.filter(j => ['Payment Funded', 'In Progress'].includes(j.status)).map(j => todo(j.title, j.status === 'Payment Funded' ? ': escrow is funded. You can start work.' : ': work is in progress. Mark it complete when done.', link(j.id), j.status === 'Payment Funded' ? 'Start work' : 'Open job')),
        ...jobList.filter(j => j.status === 'Completed' && !j.reviewed).map(j => todo(j.title, ' is complete. Review the employer.', link(j.id), 'Leave a review', false))
      ];
      const me = await userSummary(db, viewer.id);
      return { role: 'worker', jobs: jobList, bids: bidList, todos, stats: { rating: me.rating, completed: me.completed, held: await sum('held'), paid: await sum('released') } };
    },

    /* Escrow ledger for the signed-in user. */
    async payments(session) {
      const viewer = await requireUser(db, session), isE = viewer.role === 'employer', col = isE ? 'employer_id' : 'worker_id';
      const txs = await db.all(`SELECT t.*, j.title, (SELECT MAX(at) FROM transaction_events e WHERE e.transaction_id = t.id AND e.type = 'released') AS released_at
        FROM transactions t JOIN jobs j ON j.id = t.job_id WHERE t.${col} = ? ORDER BY t.created_at DESC`, viewer.id);
      const others = await userSummaries(db, txs.map(t => (isE ? t.worker_id : t.employer_id)));
      const pending = await db.all(`SELECT id, title, agreed_price FROM jobs WHERE ${col} = ? AND status = 'Worker Selected'`, viewer.id);
      return {
        role: viewer.role,
        transactions: txs.map(t => ({ id: txLabel(t.id), jobId: t.job_id, title: t.title, other: others.get(isE ? t.worker_id : t.employer_id).name, amount: t.amount, status: t.status, fundedAt: t.created_at, releasedAt: t.released_at })),
        pending: pending.map(j => ({ id: j.id, title: j.title, amount: j.agreed_price })),
        totals: { held: txs.filter(t => t.status === 'held').reduce((s, t) => s + t.amount, 0), released: txs.filter(t => t.status === 'released').reduce((s, t) => s + t.amount, 0), pending: pending.reduce((s, j) => s + j.agreed_price, 0) }
      };
    },

    /* An employer's open jobs, as cards (for their profile page). */
    async listOpenForEmployer(employerId) {
      const rows = await db.all(`SELECT j.*, (SELECT COUNT(*) FROM bids b WHERE b.job_id = j.id AND b.status = 'active') AS bid_count FROM jobs j
        WHERE j.employer_id = ? AND j.status = ? ORDER BY j.created_at DESC`, employerId, OPEN);
      const employer = await userSummary(db, employerId), cat = await categoryLookup();
      return rows.map(r => ({ ...toJob(r), bidCount: r.bid_count, employer, categoryName: cat(r.category_id).name, categoryIcon: cat(r.category_id).icon, distance: null }));
    }
  };
}
