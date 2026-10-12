/* Profiles: finding workers, public profiles, settings, portfolios, and the category and city lists. */
import { NOTIFY_TYPES, PORTFOLIO_MAX, STATUSES } from '../../shared/constants.js';
import { milesBetween } from '../../shared/format.js';
import { fail, notFound } from '../lib/errors.js';
import { now, json, coordsOf, requireUser, userSummary, allUserSummaries, categories, categoryExists, categoryMatcher, placeIn } from './common.js';

const toPortfolio = r => ({ id: r.id, kind: r.kind, src: r.src, before: r.before_url, after: r.after_url, caption: r.caption, category: r.category_id, createdAt: r.created_at });

export function createProfiles(ctx) {
  const { db } = ctx;
  const workerProfile = id => {
    const p = db.get('SELECT * FROM worker_profiles WHERE user_id = ?', id); if (!p) return null;
    return { headline: p.headline, bio: p.bio, skills: json(p.skills, []), experienceYears: p.experience_years, experience: p.experience, hourlyRate: p.hourly_rate, pricingNote: p.pricing_note,
      categories: db.all('SELECT category_id FROM worker_categories WHERE user_id = ?', id).map(r => r.category_id) };
  };
  const portfolio = id => db.all('SELECT * FROM portfolio_items WHERE worker_id = ? ORDER BY created_at DESC, id DESC', id).map(toPortfolio);

  return {
    /* Workers for employers, filtered and sorted. f: { q, cat, city, radius, rating, rate, sort } */
    listWorkers(session, f = {}) {
      const viewer = requireUser(db, session, 'employer'), here = coordsOf(viewer);
      const matchCat = categoryMatcher(db, f.cat), words = String(f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
      const catNames = new Map(categories(db).map(c => [c.id, c.name]));
      let list = allUserSummaries(db, "WHERE u.role = 'worker' AND u.verified = 1").map(u => ({ ...u, profile: workerProfile(u.id) }));
      list = list.filter(u => {
        const p = u.profile, hay = [u.name, p.headline, p.bio, ...p.skills, ...p.categories.map(c => catNames.get(c) || '')].join(' ').toLowerCase();
        if (!words.every(w => hay.includes(w))) return false;
        if (f.cat && !p.categories.some(matchCat)) return false;
        if (f.city && u.location !== f.city) return false;
        if (f.rating && u.rating.avg < Number(f.rating)) return false;
        if (f.rate !== undefined && f.rate !== '' && p.hourlyRate > Number(f.rate)) return false;
        u.distance = milesBetween(here, u.coords);
        if (Number(f.radius) && !(u.distance <= Number(f.radius))) return false;
        return true;
      });
      const s = f.sort;
      list.sort((a, b) => s === 'near' ? a.distance - b.distance : s === 'jobs' ? b.completed - a.completed : s === 'rate' ? a.profile.hourlyRate - b.profile.hourlyRate
        : b.rating.avg - a.rating.avg || b.completed - a.completed);
      return { workers: list.map(u => ({ ...u, distance: Number.isFinite(u.distance) ? u.distance : null, categoryNames: u.profile.categories.map(c => catNames.get(c)).filter(Boolean) })) };
    },

    /* A public profile. Employers' open jobs are listed for workers and for the employer themself. */
    get(session, id) {
      const viewer = requireUser(db, session), u = userSummary(db, Number(id));
      if (!u || !u.verified) notFound('That profile');
      const reviews = ctx.services.jobs.reviewsWhere('r.to_id = ?', u.id).map(r => ({ ...r, jobLinkable: viewer.role === 'worker' || r.jobEmployerId === viewer.id }));
      const out = { user: u, reviews, isMe: viewer.id === u.id, canMessage: viewer.id !== u.id && viewer.role !== u.role,
        distribution: [5, 4, 3, 2, 1].map(n => ({ stars: n, count: reviews.filter(r => r.rating === n).length })) };
      if (u.role === 'worker') {
        out.profile = workerProfile(u.id); out.portfolio = portfolio(u.id);
        out.categoryNames = out.profile.categories.map(c => (categories(db).find(x => x.id === c) || {}).name).filter(Boolean);
      } else {
        out.profile = db.get('SELECT company, about FROM employer_profiles WHERE user_id = ?', u.id) || { company: '', about: '' };
        out.postedCount = db.get('SELECT COUNT(*) AS n FROM jobs WHERE employer_id = ?', u.id).n;
        if (viewer.role === 'worker' || out.isMe) out.openJobs = ctx.services.jobs.listOpenForEmployer(u.id);
      }
      return out;
    },

    settings(session) {
      const viewer = requireUser(db, session);
      return { profile: viewer.role === 'worker' ? workerProfile(viewer.id) : db.get('SELECT company, about FROM employer_profiles WHERE user_id = ?', viewer.id),
        portfolio: viewer.role === 'worker' ? portfolio(viewer.id) : [], categories: categories(db) };
    },

    /* d: name, phone, location, avatar (upload URL), emailPrefs: [types to email], plus role-specific fields. */
    saveSettings(session, d) {
      const viewer = requireUser(db, session);
      if (!String(d.name || '').trim()) fail('Name cannot be empty.');
      if (String(d.phone || '').replace(/\D/g, '').length < 10) fail('Enter a phone number with at least 10 digits.');
      if (!String(d.location || '').trim()) fail('Location cannot be empty.');
      if (d.avatar && !ctx.storage.isUploadUrl(d.avatar)) fail('Upload your picture with the photo picker.');
      db.tx(() => {
        const moved = viewer.location !== String(d.location).trim();
        const place = moved ? placeIn(db, d.location, 'user' + viewer.id) : { location: viewer.location, lat: viewer.lat, lon: viewer.lon, known: true };
        const prefs = Array.isArray(d.emailPrefs) ? JSON.stringify(Object.fromEntries(Object.keys(NOTIFY_TYPES).filter(t => !d.emailPrefs.includes(t)).map(t => [t, false]))) : viewer.email_prefs;
        db.run('UPDATE users SET name = ?, phone = ?, location = ?, lat = ?, lon = ?, avatar = COALESCE(?, avatar), email_prefs = ? WHERE id = ?',
          String(d.name).trim(), String(d.phone).trim(), place.location, place.lat, place.lon, d.avatar || null, prefs, viewer.id);
        if (!place.known) ctx.queue.add('geocode', { location: place.location });
        if (viewer.role === 'worker') {
          db.run('UPDATE worker_profiles SET headline = ?, bio = ?, skills = ?, experience_years = ?, experience = ?, hourly_rate = ?, pricing_note = ? WHERE user_id = ?',
            String(d.headline || '').trim(), String(d.bio || '').trim(), JSON.stringify(String(d.skills || '').split(',').map(s => s.trim()).filter(Boolean)),
            Number(d.experienceYears) || 0, String(d.experience || '').trim(), Number(d.hourlyRate) || 0, String(d.pricingNote || '').trim(), viewer.id);
          db.run('DELETE FROM worker_categories WHERE user_id = ?', viewer.id);
          for (const c of [].concat(d.categories || [])) if (categoryExists(db, c)) db.run('INSERT OR IGNORE INTO worker_categories (user_id, category_id) VALUES (?, ?)', viewer.id, c);
        } else {
          db.run('UPDATE employer_profiles SET company = ?, about = ? WHERE user_id = ?', String(d.company || '').trim(), String(d.about || '').trim(), viewer.id);
        }
      });
      return { ok: true };
    },

    addPortfolioItem(session, d) {
      const viewer = requireUser(db, session, 'worker');
      if (db.get('SELECT COUNT(*) AS n FROM portfolio_items WHERE worker_id = ?', viewer.id).n >= PORTFOLIO_MAX) fail(`You can show up to ${PORTFOLIO_MAX} portfolio items. Remove one to add another.`);
      const kind = d.kind === 'pair' ? 'pair' : 'photo', caption = String(d.caption || '').trim().slice(0, 140), category = categoryExists(db, d.category) ? d.category : null;
      const ok = ctx.storage.isUploadUrl;
      if (kind === 'pair' && (!ok(d.before) || !ok(d.after))) fail('Choose both a before photo and an after photo.');
      if (kind === 'photo' && !ok(d.src)) fail('Choose a photo to add.');
      const id = db.insert('INSERT INTO portfolio_items (worker_id, kind, src, before_url, after_url, caption, category_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        viewer.id, kind, kind === 'photo' ? d.src : null, kind === 'pair' ? d.before : null, kind === 'pair' ? d.after : null, caption, category, now());
      return { ok: true, id };
    },

    removePortfolioItem(session, itemId) {
      const viewer = requireUser(db, session, 'worker');
      if (!db.run('DELETE FROM portfolio_items WHERE id = ? AND worker_id = ?', Number(itemId), viewer.id).changes) notFound('That portfolio item');
      return { ok: true };
    },

    categories: () => ({ categories: categories(db) }),
    /* City names for suggestions and filters: built-in and looked-up cities, plus any city in use. */
    cities: () => ({ cities: [...new Set([...db.all('SELECT name FROM cities').map(r => r.name), ...db.all("SELECT DISTINCT location AS name FROM users WHERE verified = 1 UNION SELECT DISTINCT location FROM jobs WHERE status = ?", STATUSES[0]).map(r => r.name)])].sort() })
  };
}
