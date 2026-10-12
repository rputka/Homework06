/* Notifications inbox. Notifications are created by the other services (see notify in common.js). */
import { requireUser } from './common.js';

export function createNotifications(ctx) {
  const { db } = ctx;
  return {
    async list(session) {
      const viewer = await requireUser(db, session);
      return { notifications: (await db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 200', viewer.id))
        .map(n => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: !!n.read, email: n.email_status, createdAt: n.created_at })) };
    },
    /* Marks the given notifications (or all of them, when ids is empty) as read. */
    async markRead(session, ids) {
      const viewer = await requireUser(db, session), list = [].concat(ids || []).map(Number).filter(Number.isSafeInteger);
      if (list.length) await db.run(`UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (${list.map(() => '?').join(',')})`, viewer.id, ...list);
      else await db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', viewer.id);
      return { ok: true };
    },
    unreadCounts: async uid => ({ notifications: (await db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', uid)).n, conversations: await ctx.services.messaging.unreadCount(uid) })
  };
}
