/* Helpers shared by the services: row-to-object mapping, user summaries, notifications, categories and places. */
import { CATS, GENERIC_CAT_ICON, KNOWN_CITIES, NEW_CATEGORY, cityKey } from '../../shared/constants.js';
import { fail } from '../lib/errors.js';

export const now = () => Date.now();
export const json = (s, fallback) => { try { return s == null ? fallback : JSON.parse(s); } catch { return fallback; } };
export const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export const coordsOf = row => (row && row.lat != null && row.lon != null ? [row.lat, row.lon] : null);
export const txLabel = id => 'TX-' + (1000 + id);

/* Public summaries of users, with rating and completed-job counts computed by the database. */
const SUMMARY_SQL = `SELECT u.id, u.role, u.name, u.location, u.lat, u.lon, u.avatar, u.verified, u.created_at,
  (SELECT COUNT(*) FROM reviews r WHERE r.to_id = u.id) AS rating_n,
  (SELECT AVG(rating) FROM reviews r WHERE r.to_id = u.id) AS rating_avg,
  (SELECT COUNT(*) FROM jobs j WHERE j.status = 'Completed' AND (j.worker_id = u.id OR j.employer_id = u.id)) AS completed
  FROM users u`;
export const toSummary = r => r && ({
  id: r.id, role: r.role, name: r.name, location: r.location, coords: coordsOf(r), avatar: r.avatar, verified: !!r.verified, createdAt: r.created_at,
  rating: { n: r.rating_n, avg: r.rating_avg || 0 }, completed: r.completed
});
export const userSummary = (db, id) => toSummary(db.get(`${SUMMARY_SQL} WHERE u.id = ?`, id));
export function userSummaries(db, ids) {
  const unique = [...new Set(ids.filter(x => x != null))];
  if (!unique.length) return new Map();
  return new Map(db.all(`${SUMMARY_SQL} WHERE u.id IN (${unique.map(() => '?').join(',')})`, ...unique).map(r => [r.id, toSummary(r)]));
}
export const allUserSummaries = (db, where, ...params) => db.all(`${SUMMARY_SQL} ${where}`, ...params).map(toSummary);

/* The signed-in user, or a 401 error. Optionally requires a role. */
export function requireUser(db, session, role) {
  const u = session.userId && db.get('SELECT * FROM users WHERE id = ?', session.userId);
  if (!u) fail('Sign in to continue.', 401);
  if (role && u.role !== role) fail(role === 'employer' ? 'Only employers can do that.' : 'Only workers can do that.', 403);
  return u;
}

/* In-app notification; the email copy is sent by a background job, and the recipient's open pages hear about it. */
export function notify(ctx, userId, type, title, body, link = '') {
  if (!userId) return;
  const id = ctx.db.insert('INSERT INTO notifications (user_id, type, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?)', userId, type, title, body, link, now());
  ctx.queue.add('email', { notificationId: id });
  ctx.events.emit(userId, { type: 'notification' });
}

/* Categories: built-ins plus ones employers add. */
export function ensureBuiltins(db) {
  db.tx(() => {
    for (const c of CATS) db.run('INSERT OR IGNORE INTO categories (id, name, icon, hue, custom, created_at) VALUES (?, ?, ?, ?, 0, ?)', c.id, c.name, c.icon, c.hue, 0);
    for (const [name, [lat, lon]] of Object.entries(KNOWN_CITIES)) db.run('INSERT OR IGNORE INTO cities (id, name, lat, lon, created_at) VALUES (?, ?, ?, ?, 0)', cityKey(name), name, lat, lon);
  });
}
export const categories = db => db.all('SELECT id, name, icon, hue, custom FROM categories ORDER BY name COLLATE NOCASE').map(c => ({ ...c, custom: !!c.custom }));
export const categoryExists = (db, id) => !!db.get('SELECT 1 FROM categories WHERE id = ?', id);

/* The category for a job form: an existing one, or a new one the employer typed (reusing any category with the
   same name). Call it last, after the rest of the form is valid, so rejected forms don't leave stray categories. */
export function resolveCategory(db, d, userId) {
  if (d.category !== NEW_CATEGORY) return categoryExists(db, d.category) ? d.category : fail('Choose a category.');
  const name = String(d.newCategory || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 40 || !/[a-z]/i.test(name)) fail('Name the new category in 2 to 40 characters.');
  const same = db.get('SELECT id FROM categories WHERE name = ?', name); // case-insensitive column
  if (same) return same.id;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
  let id = 'cat-' + slug; for (let n = 2; categoryExists(db, id); n++) id = `cat-${slug}-${n}`;
  db.run('INSERT INTO categories (id, name, icon, hue, custom, created_by, created_at) VALUES (?, ?, ?, 210, 1, ?, ?)', id, name[0].toUpperCase() + name.slice(1), GENERIC_CAT_ICON, userId, now());
  return id;
}

/* Where something in a city goes on the map: near the city's center, nudged up to about two miles (stable per key)
   so markers don't stack. Returns { location, lat, lon, known }; unknown cities are looked up later by a background
   job (see workers/geocode.js), which fills in the position. */
export function placeIn(db, typed, key) {
  const city = db.get('SELECT name, lat, lon FROM cities WHERE id = ?', cityKey(typed));
  if (!city) return { location: String(typed).trim().replace(/\s+/g, ' '), lat: null, lon: null, known: false };
  return { location: city.name, ...nudge(city, key), known: true };
}
export function nudge(city, key) {
  const n = salt => ((hash(key + salt) % 1000) / 1000 - 0.5) * 0.06;
  return { lat: +(city.lat + n('a')).toFixed(5), lon: +(city.lon + n('o')).toFixed(5) };
}

/* Matches category text typed in a filter box: empty matches everything; otherwise an id or part of a name. */
export function categoryMatcher(db, text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return () => true;
  const ids = new Set(categories(db).filter(c => c.id === t || c.name.toLowerCase().includes(t)).map(c => c.id));
  return id => ids.has(id);
}
