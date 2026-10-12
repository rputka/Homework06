/* Notifications inbox. Data: GET /api/notifications */
import { html } from '../lib/html.js';
import { ago, plural } from '/shared/format.js';
import { api } from '../api.js';
import { refreshSession } from '../session.js';
import { A } from '../actions.js';
import { render, go } from '../router.js';

// What happened to the email copy of a notification.
const EMAIL = { sent: 'Emailed', skipped: 'Email off for this type', 'not-configured': 'Email not set up', failed: 'Email failed', pending: 'Sending email…' };

export default {
  async load() { const r = await api.get('/api/notifications'); if (!r.ok) throw r; return r; },
  render({ notifications: list }) {
    const unread = list.filter(n => !n.read).length;
    const item = n => html`<button type="button" class="notif ${n.read ? '' : 'unread'}" data-act="openNotification" data-id="${n.id}" data-read="${n.read ? 1 : 0}" data-link="${n.link || '#/dashboard'}">
      <span class="notif-dot" aria-hidden="true"></span><span class="grow"><b>${n.title}</b><span class="notif-body">${n.body}</span>
      <span class="small muted">${ago(n.createdAt)}${EMAIL[n.email] ? ' · ' + EMAIL[n.email] : ''}</span></span>${n.read ? '' : html`<span class="sr">Unread</span>`}</button>`;
    return html`<div class="page form-page"><div class="page-head spread"><div><h1 style="font-size:2rem">Notifications</h1><p class="muted" style="margin:0">${unread ? plural(unread, 'unread notification') : 'You are all caught up.'} Choose which ones are emailed to you in <a href="#/settings">Edit profile</a>.</p></div>
    ${unread ? html`<button class="btn btn-outline" data-act="markAllRead">Mark all as read</button>` : ''}</div>
    <section class="card notif-card">${list.length ? list.map(item) : html`<p class="muted" style="margin:0">No notifications yet. You will hear about bids, hiring, payments and reviews here.</p>`}</section></div>`;
  }
};

Object.assign(A, {
  async openNotification(el) {
    if (el.dataset.read === '0') await api.post('/api/notifications/read', { ids: [Number(el.dataset.id)] });
    go(el.dataset.link);
  },
  async markAllRead() { await api.post('/api/notifications/read', { ids: [] }); await refreshSession(); return render(true); }
});
