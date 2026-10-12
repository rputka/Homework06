/* Boot: load the session, wire up events and the router, then show the first page. */
import { html } from './lib/html.js';
import { $ } from './lib/dom.js';
import { session, refreshSession, onEvent } from './session.js';
import { installListeners } from './actions.js';
import { render, startRouter, currentPage, refreshIfIdle } from './router.js';
import { updateBadges } from './ui/layout.js';
import { empty } from './ui/components.js';

/* Live updates: keep the bell and Messages count current, and refresh pages showing a job that just changed. */
onEvent(async ev => {
  if (ev.type === 'notification' || ev.type === 'message') { await refreshSession().catch(() => {}); updateBadges(); }
  if (ev.type === 'job') {
    const page = currentPage();
    if (!page) return;
    if (['dashboard', 'payments'].includes(page.key) || (page.key === 'job' && page.data && page.data.job && page.data.job.id === ev.jobId)) refreshIfIdle();
  }
});

installListeners();
startRouter();
try { await refreshSession(); render(false); }
catch {
  $('#app').innerHTML = String(html`<main id="main" class="container"><div class="page">${empty('Nearhand could not reach its server', html`Start it with <b>npm start</b>, then open <b>http://localhost:3000</b>.`)}</div></main>`);
}
window.Nearhand = { session }; // for poking around in the browser console
