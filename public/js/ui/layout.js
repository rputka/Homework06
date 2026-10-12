/* Page chrome: the header (role-based tabs, bell, Messages count, profile menu) and the footer. */
import { html, raw } from '../lib/html.js';
import { session } from '../session.js';
import { avatar } from './components.js';

const NAV = {
  employer: [['#/dashboard', 'Dashboard', 'dashboard'], ['#/post', 'Post a job', 'post'], ['#/workers', 'Find workers', 'workers'], ['#/messages', 'Messages', 'messages'], ['#/payments', 'Payment history', 'payments']],
  worker: [['#/dashboard', 'Dashboard', 'dashboard'], ['#/jobs', 'Find jobs', 'jobs'], ['#/messages', 'Messages', 'messages'], ['#/payments', 'Payment history', 'payments']]
};
const burgerIcon = raw('<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>');
const bellIcon = raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>');

export function bell() {
  const n = session.unread.notifications;
  return html`<a class="bell" href="#/notifications" aria-label="Notifications${n ? `, ${n} unread` : ''}">${bellIcon}${n ? html`<span class="badge">${n > 9 ? '9+' : n}</span>` : ''}</a>`;
}
export const messagesTabLabel = () => { const n = session.unread.conversations; return html`Messages${n ? html` <span class="count">${n}</span>` : ''}`; };

function profileMenu(me) {
  return html`<div class="profile-menu"><button class="me" data-act="profileMenu" aria-haspopup="true" aria-expanded="false" aria-controls="pmPop" aria-label="Account menu">${avatar(me, 34)}</button>
  <div class="pm-pop" id="pmPop"><div class="pm-who">${avatar(me, 40)}<div><b>${me.name}</b><span class="chip neutral">${me.role === 'employer' ? 'Employer' : 'Worker'}</span></div></div>
  <a href="#/profile/${me.id}">View profile</a><a href="#/settings">Edit profile</a><button type="button" data-act="logout">Sign out</button></div></div>`;
}

export function header(key) {
  const me = session.me;
  const logo = html`<a class="logo" href="#/"><span class="logo-mark" aria-hidden="true">N</span>Nearhand</a>`;
  if (!me) return html`<header class="site-header"><div class="container">${logo}<span class="grow"></span><div class="header-right"><a class="btn btn-outline btn-sm" href="#/login">Sign in</a><a class="btn btn-primary btn-sm" href="#/signup">Sign up</a></div></div></header>`;
  const nav = NAV[me.role].map(([href, label, k]) => html`<a href="${href}" class="${k === key ? 'active' : ''}">${k === 'messages' ? messagesTabLabel() : label}</a>`);
  return html`<header class="site-header"><div class="container">${logo}
  <nav class="nav" aria-label="Main">${nav}</nav><div class="header-right"><button class="btn btn-outline btn-sm burger" data-act="burger" aria-label="Open menu" aria-expanded="false">${burgerIcon}</button>${bell()}${profileMenu(me)}</div></div></header>`;
}

export const footer = () => html`<footer class="site-footer"><div class="container"><span>© ${new Date().getFullYear()} Nearhand. All rights reserved.</span>
  <nav class="footer-links" aria-label="Company"><a href="#/about">About</a><a href="#/terms">Terms</a><a href="#/privacy">Privacy</a><a href="#/contact">Contact</a></nav></div></footer>`;

/* Refreshes the bell and the Messages tab count in place. */
export function updateBadges() {
  const b = document.querySelector('.bell'); if (b) b.outerHTML = String(bell());
  const tab = document.querySelector('.nav a[href="#/messages"]'); if (tab) tab.innerHTML = String(messagesTabLabel());
}
