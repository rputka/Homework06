/* Sign-in sessions. The browser holds a random token in an HttpOnly cookie; the session lives in the database and
   expires after `days` without use. The token changes whenever the signed-in user changes (sign in, verify, sign
   out), so a token picked up before signing in is useless afterward. Sessions are only created when needed. */
import crypto from 'node:crypto';

const COOKIE = 'nh_session';
const newToken = () => crypto.randomBytes(24).toString('hex');

export function createSessions(db, { days, secure }) {
  const ttl = days * 86400000;
  const cookie = (token, maxAge) => `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  setInterval(() => db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now()), 3600000).unref();

  return {
    /* The request's session as a plain object { userId, pendingId, resetFor }, plus bookkeeping fields. */
    load(req) {
      const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{48})`));
      const row = m && db.get('SELECT * FROM sessions WHERE token = ? AND expires_at > ?', m[1], Date.now());
      const data = row ? { userId: row.user_id, pendingId: row.pending_id, resetFor: row.reset_for } : { userId: null, pendingId: null, resetFor: null };
      return { ...data, _token: row ? row.token : null, _before: JSON.stringify(data), _expires: row ? row.expires_at : 0 };
    },

    /* Saves changes (and extends the expiry) after a request; sets or clears the cookie when needed. */
    save(session, res) {
      const data = { userId: session.userId || null, pendingId: session.pendingId || null, resetFor: session.resetFor || null };
      const changed = JSON.stringify(data) !== session._before, empty = !data.userId && !data.pendingId && !data.resetFor;
      const userChanged = data.userId !== JSON.parse(session._before).userId;
      if (!session._token && empty) return;
      if (session._token && (userChanged || empty)) {
        db.run('DELETE FROM sessions WHERE token = ?', session._token);
        if (empty) { res.setHeader('Set-Cookie', cookie('', 0)); return; }
        session._token = null;
      }
      const stale = session._expires - Date.now() < ttl - 3600000; // extend at most once an hour
      if (session._token && !changed && !stale) return;
      const token = session._token || newToken(), expires = Date.now() + ttl;
      db.run(`INSERT INTO sessions (token, user_id, pending_id, reset_for, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, pending_id = excluded.pending_id, reset_for = excluded.reset_for, expires_at = excluded.expires_at`,
        token, data.userId, data.pendingId, data.resetFor, Date.now(), expires);
      if (token !== session._token || stale) res.setHeader('Set-Cookie', cookie(token, Math.floor(ttl / 1000))); // refresh the cookie's lifetime too
    }
  };
}
