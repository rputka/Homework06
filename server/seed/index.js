/* Loads the seed data (server/seed/data.js) into an empty database, mapping its readable ids ('e1', 'j3', 'c1')
   to database ids. Every seeded account uses the password demo1234. */
import { buildSeed } from './data.js';

export function seedDatabase(db) {
  const s = buildSeed();
  const ids = { user: new Map(), job: new Map(), bid: new Map(), conversation: new Map() };
  const u = id => ids.user.get(id), j = id => ids.job.get(id);
  // Links in seeded notifications use the readable ids; point them at the database ids.
  const relink = link => String(link || '').replace(/#\/job\/(j\d+)/, (_, x) => '#/job/' + j(x)).replace(/#\/profile\/(\w+)/, (_, x) => '#/profile/' + u(x))
    .replace(/#\/messages\/(c\d+)/, (_, x) => '#/messages/' + ids.conversation.get(x));

  db.tx(() => {
    for (const x of s.users) {
      ids.user.set(x.id, db.insert(`INSERT INTO users (role, name, email, password_hash, phone, location, lat, lon, verified, avatar, email_prefs, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, x.role, x.name, x.email, x.password, x.phone, x.location, x.lat, x.lon, x.verified ? 1 : 0, x.avatar, JSON.stringify(x.emailPrefs || {}), x.createdAt));
    }
    for (const p of s.employerProfiles) db.run('INSERT INTO employer_profiles (user_id, company, about) VALUES (?, ?, ?)', u(p.userId), p.company, p.about);
    for (const p of s.workerProfiles) {
      db.run('INSERT INTO worker_profiles (user_id, headline, bio, skills, experience_years, experience, hourly_rate, pricing_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        u(p.userId), p.headline, p.bio, JSON.stringify(p.skills), p.experienceYears, p.experience, p.hourlyRate, p.pricingNote);
      for (const c of p.categories) db.run('INSERT INTO worker_categories (user_id, category_id) VALUES (?, ?)', u(p.userId), c);
      for (const item of p.portfolio || []) {
        db.run('INSERT INTO portfolio_items (worker_id, kind, src, before_url, after_url, caption, category_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          u(p.userId), item.kind, item.src || null, item.before || null, item.after || null, item.caption, item.category, item.createdAt);
      }
    }
    for (const x of s.jobs) {
      const id = db.insert(`INSERT INTO jobs (employer_id, title, description, category_id, location, lat, lon, experience, budget_min, budget_max, schedule, status, worker_id, agreed_price, completion_note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, u(x.employerId), x.title, x.description, x.category, x.location, x.lat, x.lon, x.experience, x.budgetMin, x.budgetMax,
        x.schedule ? JSON.stringify(x.schedule) : null, x.status, u(x.workerId), x.agreedPrice, x.completionNote, x.createdAt);
      ids.job.set(x.id, id);
      for (const h of x.history) db.run('INSERT INTO job_history (job_id, status, at) VALUES (?, ?, ?)', id, h.status, h.at);
    }
    for (const b of s.bids) {
      const c = b.counter || {};
      const id = db.insert(`INSERT INTO bids (job_id, worker_id, price, message, status, counter_price, counter_note, counter_status, counter_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        j(b.jobId), u(b.workerId), b.price, b.message, b.status, c.price ?? null, c.note ?? null, c.status ?? null, c.at ?? null, b.createdAt);
      ids.bid.set(b.id, id);
      b.photos.forEach((url, i) => db.run('INSERT INTO bid_photos (bid_id, position, url) VALUES (?, ?, ?)', id, i, url));
      for (const h of b.history) db.run('INSERT INTO bid_history (bid_id, type, price, at) VALUES (?, ?, ?, ?)', id, h.type, h.price, h.at);
    }
    for (const r of s.reviews) db.run('INSERT INTO reviews (job_id, from_id, to_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)', j(r.jobId), u(r.fromId), u(r.toId), r.rating, r.text, r.createdAt);
    for (const t of s.transactions) {
      const id = db.insert('INSERT INTO transactions (job_id, employer_id, worker_id, amount, fee, status, card, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        j(t.jobId), u(t.employerId), u(t.workerId), t.amount, t.fee, t.status, t.card, t.createdAt);
      for (const e of t.events) db.run('INSERT INTO transaction_events (transaction_id, type, at) VALUES (?, ?, ?)', id, e.type, e.at);
    }
    for (const c of s.conversations) {
      const [a, b] = c.participants, employer = s.users.find(x => x.id === a).role === 'employer' ? a : b, worker = employer === a ? b : a;
      ids.conversation.set(c.id, db.insert('INSERT INTO conversations (employer_id, worker_id, employer_last_read, worker_last_read, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        u(employer), u(worker), c.lastRead[employer] || 0, c.lastRead[worker] || 0, c.createdAt, c.updatedAt));
    }
    for (const m of s.messages) db.run('INSERT INTO messages (conversation_id, from_id, text, created_at) VALUES (?, ?, ?, ?)', ids.conversation.get(m.conversationId), u(m.fromId), m.text, m.createdAt);
    for (const n of s.notifications) {
      db.run("INSERT INTO notifications (user_id, type, title, body, link, read, email_status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'sample', ?)",
        u(n.userId), n.type, n.title, n.body, relink(n.link), n.read ? 1 : 0, n.createdAt);
    }
  });
}
