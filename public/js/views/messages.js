/* Messages: the conversation list and one open thread. New messages arrive over the live event stream and are patched
   in without touching what's being typed. Data: GET /api/conversations and GET /api/conversations/:id */
import { html } from '../lib/html.js';
import { $, toast } from '../lib/dom.js';
import { MESSAGE_MAX } from '/shared/constants.js';
import { ago, fmtDate, first } from '/shared/format.js';
import { api } from '../api.js';
import { session, refreshSession, onEvent } from '../session.js';
import { A, F } from '../actions.js';
import { go, route } from '../router.js';
import { avatar } from '../ui/components.js';
import { updateBadges } from '../ui/layout.js';

const time = ts => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const stamp = ts => (new Date(ts).toDateString() === new Date().toDateString() ? time(ts) : `${fmtDate(ts)}, ${time(ts)}`);

const listHtml = (list, activeId, role) => (list.length ? list.map(c => html`<a class="convo ${c.id === activeId ? 'active' : ''} ${c.unread ? 'unread' : ''}" href="#/messages/${c.id}">${avatar(c.other, 40)}
  <span class="grow"><span class="spread"><b>${c.other.name}</b>${c.last ? html`<span class="small muted">${ago(c.last.at)}</span>` : ''}</span>
  <span class="convo-last">${c.last ? (c.last.mine ? 'You: ' : '') + c.last.text : 'No messages yet'}</span></span>${c.unread ? html`<span class="notif-dot" aria-label="Unread"></span>` : ''}</a>`)
  : html`<p class="muted small" style="padding:12px;margin:0">No conversations yet. Use the Message button on a ${role === 'employer' ? "worker's profile or bid" : "job or employer's profile"} to start one.</p>`);
const threadHtml = t => (t.messages.length ? t.messages.map(m => html`<div class="bubble ${m.mine ? 'mine' : 'theirs'}"><p>${m.text}</p><span>${stamp(m.createdAt)}</span></div>`)
  : html`<p class="muted small thread-empty">Say hello to ${first(t.other.name)}.</p>`);

async function load([id]) {
  const [list, thread] = await Promise.all([api.get('/api/conversations'), id ? api.get('/api/conversations/' + encodeURIComponent(id)) : null]);
  if (!list.ok) throw list;
  if (thread && !thread.ok) throw thread;
  return { list: list.conversations, thread };
}

async function markRead(id) { await api.post(`/api/conversations/${id}/read`); await refreshSession(); updateBadges(); }

/* Refreshes the list and open thread in place, keeping the scroll position unless already at the bottom. */
async function patch() {
  if (route.path[0] !== 'messages') return;
  let d; try { d = await load(route.path.slice(1)); } catch { return; }
  const list = $('#convoList'), body = $('#threadBody');
  if (list) list.innerHTML = String(listHtml(d.list, d.thread && d.thread.id, session.me.role));
  if (d.thread && body) {
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
    body.innerHTML = String(html`${threadHtml(d.thread)}`);
    if (atBottom) body.scrollTop = body.scrollHeight;
    if ((d.list.find(c => c.id === d.thread.id) || {}).unread) await markRead(d.thread.id);
  }
  await refreshSession(); updateBadges();
}
onEvent(ev => { if (ev.type === 'message') patch(); });

export default {
  what: 'conversation',
  load,
  render({ list, thread: t }, { params }) {
    const role = session.me.role;
    const thread = t ? html`<div class="thread-head"><a class="linkbtn back small" href="#/messages">← All messages</a>${avatar(t.other, 36)}<div class="grow"><a href="#/profile/${t.other.id}"><b>${t.other.name}</b></a>
      <div class="small muted">${t.other.role === 'employer' ? 'Employer' : 'Worker'} · ${t.other.location}</div></div></div>
      <div class="thread-body" id="threadBody">${threadHtml(t)}</div>
      <form class="composer" data-form="message" data-id="${t.id}"><label class="sr" for="msgText">Message</label><textarea id="msgText" name="text" rows="2" maxlength="${MESSAGE_MAX}" placeholder="Write a message…" title="Enter to send, Shift+Enter for a new line" required></textarea><button class="btn btn-primary">Send</button></form>`
      : html`<div class="thread-none"><p class="muted">Choose a conversation to read it.</p></div>`;
    return html`<div class="page"><div class="page-head"><h1 style="font-size:2rem">Messages</h1></div>
    <section class="card messenger ${t ? 'has-thread' : ''}"><nav class="convo-list" aria-label="Conversations" id="convoList">${listHtml(list, t && t.id, role)}</nav><div class="thread">${thread}</div></section></div>`;
  },
  mount({ list, thread }) {
    if (!thread) return;
    const body = $('#threadBody'); if (body) body.scrollTop = body.scrollHeight;
    if ((list.find(c => c.id === thread.id) || {}).unread) markRead(thread.id);
  }
};

/* "Message <name>" buttons anywhere: open (or start) the conversation. */
A.messageUser = async el => {
  const r = await api.post('/api/conversations', { userId: Number(el.dataset.user) });
  if (r.ok) go('#/messages/' + r.id); else toast(r.error, 'error');
};

F.message = async (f, d) => {
  const r = await api.post(`/api/conversations/${f.dataset.id}/messages`, { text: d.get('text') });
  if (!r.ok) return toast(r.error, 'error');
  f.text.value = '';
  await patch();
  setTimeout(() => f.text.focus(), 0);
};
