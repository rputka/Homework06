/* Messaging: one conversation per employer-worker pair. Only the two people in a conversation can see it. */
import { MESSAGE_MAX } from '../../shared/constants.js';
import { fail, notFound } from '../lib/errors.js';
import { now, requireUser, notify, userSummary, userSummaries } from './common.js';

export function createMessaging(ctx) {
  const { db } = ctx;
  const sideOf = (c, uid) => (c.employer_id === uid ? 'employer' : 'worker');
  const otherOf = (c, uid) => (c.employer_id === uid ? c.worker_id : c.employer_id);
  const unreadSql = `EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.from_id != ? AND m.created_at >
    CASE WHEN c.employer_id = ? THEN c.employer_last_read ELSE c.worker_last_read END)`;
  /* The conversation, if the user is in it; otherwise a 404 (so outsiders can't tell it exists). */
  const mine = (id, uid) => {
    const c = db.get('SELECT * FROM conversations WHERE id = ? AND (employer_id = ? OR worker_id = ?)', Number(id), uid, uid);
    return c || notFound('That conversation');
  };

  return {
    list(session) {
      const viewer = requireUser(db, session);
      const rows = db.all(`SELECT c.*, ${unreadSql} AS unread,
          (SELECT text FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_text,
          (SELECT from_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_from,
          (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_at
        FROM conversations c WHERE c.employer_id = ? OR c.worker_id = ? ORDER BY c.updated_at DESC`, viewer.id, viewer.id, viewer.id, viewer.id);
      const others = userSummaries(db, rows.map(c => otherOf(c, viewer.id)));
      return { conversations: rows.map(c => ({ id: c.id, other: others.get(otherOf(c, viewer.id)), unread: !!c.unread, updatedAt: c.updated_at,
        last: c.last_text == null ? null : { text: c.last_text, mine: c.last_from === viewer.id, at: c.last_at } })) };
    },

    get(session, id) {
      const viewer = requireUser(db, session), c = mine(id, viewer.id);
      return { id: c.id, other: userSummary(db, otherOf(c, viewer.id)),
        messages: db.all('SELECT id, from_id, text, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at, id', c.id)
          .map(m => ({ id: m.id, mine: m.from_id === viewer.id, text: m.text, createdAt: m.created_at })) };
    },

    /* Finds or creates the conversation with another user (an employer and a worker only). */
    start(session, otherId) {
      const viewer = requireUser(db, session), other = db.get('SELECT id, role, verified FROM users WHERE id = ?', Number(otherId));
      if (!other || !other.verified || other.id === viewer.id || other.role === viewer.role) fail('You can only message workers (if you are an employer) or employers (if you are a worker).');
      const [employerId, workerId] = viewer.role === 'employer' ? [viewer.id, other.id] : [other.id, viewer.id];
      const existing = db.get('SELECT id FROM conversations WHERE employer_id = ? AND worker_id = ?', employerId, workerId);
      if (existing) return { ok: true, id: existing.id };
      const t = now();
      const id = db.insert(`INSERT INTO conversations (employer_id, worker_id, ${viewer.role}_last_read, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, employerId, workerId, t, t, t);
      return { ok: true, id };
    },

    send(session, id, text) {
      const viewer = requireUser(db, session), c = mine(id, viewer.id);
      text = String(text || '').trim();
      if (!text) fail('Write a message first.');
      if (text.length > MESSAGE_MAX) fail(`Messages can be up to ${MESSAGE_MAX} characters.`);
      const t = now(), toId = otherOf(c, viewer.id), link = '#/messages/' + c.id;
      db.tx(() => {
        db.insert('INSERT INTO messages (conversation_id, from_id, text, created_at) VALUES (?, ?, ?, ?)', c.id, viewer.id, text, t);
        db.run(`UPDATE conversations SET updated_at = ?, ${sideOf(c, viewer.id)}_last_read = ? WHERE id = ?`, t, t, c.id);
        // One unread alert per conversation, so a busy chat doesn't flood the recipient's notifications and email.
        if (!db.get("SELECT 1 FROM notifications WHERE user_id = ? AND type = 'message' AND link = ? AND read = 0", toId, link)) {
          notify(ctx, toId, 'message', `New message from ${viewer.name}`, `"${text.slice(0, 160)}${text.length > 160 ? '…' : ''}"`, link);
        }
      });
      ctx.events.emit(toId, { type: 'message', conversationId: c.id });
      ctx.events.emit(viewer.id, { type: 'message', conversationId: c.id });
      return { ok: true };
    },

    /* Marks the conversation read, along with its unread message alert. */
    markRead(session, id) {
      const viewer = requireUser(db, session), c = mine(id, viewer.id);
      db.tx(() => {
        db.run(`UPDATE conversations SET ${sideOf(c, viewer.id)}_last_read = ? WHERE id = ?`, now(), c.id);
        db.run("UPDATE notifications SET read = 1 WHERE user_id = ? AND type = 'message' AND link = ?", viewer.id, '#/messages/' + c.id);
      });
      return { ok: true };
    },

    unreadCount: uid => db.get(`SELECT COUNT(*) AS n FROM conversations c WHERE (c.employer_id = ? OR c.worker_id = ?) AND ${unreadSql}`, uid, uid, uid, uid).n
  };
}
