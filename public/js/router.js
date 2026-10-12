/* Hash-based router. Each page (in views/) is { load(params, query) -> data, render(data, ctx) -> html, mount?(data) }:
   load fetches just that page's data from the API, render builds the HTML, mount wires up live parts like maps. */
import { html } from './lib/html.js';
import { $, toast, closeModal } from './lib/dom.js';
import { session, refreshSession } from './session.js';
import { header, footer } from './ui/layout.js';
import { empty, notFoundPage } from './ui/components.js';
import { pages } from './views/index.js';

const PUBLIC = new Set(['', 'login', 'signup', 'verify', 'forgot', 'reset', 'about', 'terms', 'privacy', 'contact']); // everything else needs sign-in
const SIGNED_OUT_ONLY = new Set(['', 'login', 'signup']); // signed-in users go to their dashboard instead
const ROLE_ONLY = { post: 'employer', workers: 'employer', jobs: 'worker' };

export let route = { path: [], query: {} };
let seq = 0, lastSig = null, current = null;

function parseRoute() {
  const h = (window.location.hash || '#/').slice(1), [p, q] = h.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(q || '')) };
}
export function go(hash) { if (window.location.hash === hash) render(); else window.location.hash = hash; }
/* The page on screen: { key, data, view }. */
export const currentPage = () => current;

export async function render(keepScroll) {
  route = parseRoute();
  const key = route.path[0] || '', me = session.me;
  if (!PUBLIC.has(key) && !me) { toast('Sign in or create an account to continue.', 'error'); return go('#/login'); }
  if (me && SIGNED_OUT_ONLY.has(key)) return go('#/dashboard');
  if (me && ROLE_ONLY[key] && me.role !== ROLE_ONLY[key]) return go('#/dashboard');
  const view = pages[key], my = ++seq;
  let data = null, body;
  try {
    if (!view) throw { status: 404 };
    data = view.load ? await view.load(route.path.slice(1), route.query) : null;
    if (my !== seq) return; // a newer navigation started while this one was loading
    body = view.render(data, { params: route.path.slice(1), query: route.query });
  } catch (err) {
    if (my !== seq) return;
    if (err && err.status === 401) { await refreshSession(); return go('#/login'); }
    if (!(err && err.status)) console.error(err);
    body = err && err.status === 404 ? notFoundPage(view && view.what) : html`<div class="page">${empty('Something went wrong', (err && err.error) || 'Try again in a moment.', html`<a class="btn btn-primary" href="#/">Home</a>`)}</div>`;
    data = null;
  }
  const y = window.scrollY, sig = route.path.join('/');
  $('#app').innerHTML = String(html`${header(key)}<main id="main" class="container">${body}</main>${footer()}`);
  current = { key, data, view };
  if (data && view && view.mount) { try { view.mount(data); } catch (err) { console.error(err); } }
  if (keepScroll && sig === lastSig) window.scrollTo(0, y); else window.scrollTo(0, 0);
  lastSig = sig;
}

/* Re-renders the current page with fresh data, unless the user is in the middle of typing in it. */
export function refreshIfIdle() {
  const a = document.activeElement;
  if (a && a.closest('main') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  if ($('#modalRoot .modal')) return;
  render(true);
}

export function startRouter() {
  window.addEventListener('hashchange', async () => {
    closeModal();
    try { await refreshSession(); } catch { /* keep what we have; the page load will report trouble */ }
    render(false);
  });
}
