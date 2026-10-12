/* Accounts: sign up, verify email, sign in and out, password reset, and what the browser knows about its session.
   `session` is { userId, pendingId, resetFor }; the HTTP layer saves it (and rotates the token when userId changes). */
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { fail, HttpError } from '../lib/errors.js';
import { now, json, coordsOf, placeIn } from './common.js';

const findByEmail = (db, email) => db.get('SELECT * FROM users WHERE lower(email) = ?', String(email || '').trim().toLowerCase());

export function createAccounts(ctx) {
  const { db } = ctx;

  return {
    async signup(session, d) {
      const email = String(d.email || '').trim().toLowerCase(), name = String(d.name || '').trim();
      if (!['employer', 'worker'].includes(d.role)) fail('Choose a role: Employer or Worker.');
      if (!name) fail('Enter your full name.');
      if (!/^\S+@\S+\.\S+$/.test(email)) fail('Enter a valid email address.');
      if (String(d.password || '').length < 8) fail('Use a password with at least 8 characters.');
      if (String(d.phone || '').replace(/\D/g, '').length < 10) fail('Enter a phone number with at least 10 digits.');
      if (!String(d.location || '').trim()) fail('Enter your city (for example, Austin, TX).');
      if (await findByEmail(db, email)) fail('An account with this email already exists. Sign in instead.');
      const id = await db.tx(async () => {
        const id = await db.insert('INSERT INTO users (role, name, email, password_hash, phone, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          d.role, name, email, hashPassword(d.password), String(d.phone).trim(), String(d.location).trim(), now());
        const place = await placeIn(db, d.location, 'user' + id);
        await db.run('UPDATE users SET location = ?, lat = ?, lon = ? WHERE id = ?', place.location, place.lat, place.lon, id);
        await db.run(`INSERT INTO ${d.role === 'employer' ? 'employer_profiles' : 'worker_profiles'} (user_id) VALUES (?)`, id);
        if (!place.known) await ctx.queue.add('geocode', { location: place.location });
        return id;
      });
      session.pendingId = id;
      return { ok: true };
    },

    async verify(session) {
      const u = session.pendingId && await db.get('SELECT id FROM users WHERE id = ?', session.pendingId);
      if (!u) fail('There is no signup waiting to be verified.', 404);
      await db.run('UPDATE users SET verified = 1 WHERE id = ?', u.id);
      session.pendingId = null; session.userId = u.id;
      return { ok: true };
    },

    async login(session, email, password) {
      const u = await findByEmail(db, email);
      if (!u || !verifyPassword(password, u.password_hash)) fail('Email or password is incorrect.', 401);
      if (!u.verified) { session.pendingId = u.id; throw Object.assign(new HttpError(403, 'Verify your email before signing in.'), { code: 'unverified' }); }
      session.userId = u.id;
      return { ok: true, name: u.name };
    },

    logout(session) { session.userId = null; return { ok: true }; },

    async requestReset(session, email) {
      const u = await findByEmail(db, email);
      session.resetFor = u ? u.id : null;
      return { ok: true, found: !!u };
    },

    async resetPassword(session, password) {
      const u = session.resetFor && await db.get('SELECT id FROM users WHERE id = ?', session.resetFor);
      if (!u) fail('This reset link has expired. Request a new one.');
      if (String(password || '').length < 8) fail('Use a password with at least 8 characters.');
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), u.id);
      session.resetFor = null;
      return { ok: true };
    },

    /* Everything the page header and auth pages need: the signed-in user, unread counts, and any signup or reset
       in progress. Never includes password hashes. */
    async sessionInfo(session) {
      const row = session.userId && await db.get('SELECT * FROM users WHERE id = ?', session.userId);
      const pending = session.pendingId && await db.get('SELECT name, email, role FROM users WHERE id = ?', session.pendingId);
      const reset = session.resetFor && await db.get('SELECT email FROM users WHERE id = ?', session.resetFor);
      const me = row ? {
        id: row.id, role: row.role, name: row.name, email: row.email, phone: row.phone, location: row.location, coords: coordsOf(row),
        avatar: row.avatar, emailPrefs: json(row.email_prefs, {}), createdAt: row.created_at
      } : null;
      return { me, pending: pending || null, resetFor: reset || null, unread: me ? await ctx.services.notifications.unreadCounts(me.id) : null };
    }
  };
}
