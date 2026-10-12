/* What the browser knows about the signed-in user, plus live updates from the server (Server-Sent Events). */
import { api } from './api.js';

export const session = { me: null, pending: null, resetFor: null, unread: { notifications: 0, conversations: 0 } };
const listeners = new Set();
let source = null;

export async function refreshSession() {
  const r = await api.get('/api/session');
  if (!r.ok) throw r;
  Object.assign(session, { me: r.me, pending: r.pending, resetFor: r.resetFor, unread: r.unread || { notifications: 0, conversations: 0 } });
  connectEvents();
  return session;
}

/* Subscribes to live events: fn({ type: 'notification' | 'message' | 'job', ... }). */
export const onEvent = fn => listeners.add(fn);

/* One event stream per tab while signed in; the browser reconnects it automatically if it drops. */
function connectEvents() {
  if (session.me && !source) {
    source = new EventSource('/api/events');
    source.onmessage = e => { let ev; try { ev = JSON.parse(e.data); } catch { return; } listeners.forEach(fn => fn(ev)); };
  } else if (!session.me && source) { source.close(); source = null; }
}
