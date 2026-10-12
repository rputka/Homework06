/* Event wiring. Pages register handlers in the registries (see registry.js); one set of document listeners
   dispatches them, so re-rendering a page never leaves stale listeners behind. */
import { A, F, onInput, onChange, getCities } from './registry.js';
import { html } from './lib/html.js';
import { $, toast, closeModal } from './lib/dom.js';
import { api } from './api.js';
import { refreshSession } from './session.js';
import { render, go } from './router.js';

export { A, F, onInput, onChange, ui, setCities } from './registry.js';

/* Waits for an API call; shows its error, or shows msg, closes any dialog and re-renders the page. */
export async function done(pending, msg) {
  const r = await pending;
  if (!r.ok) { toast(r.error, 'error'); return null; }
  if (msg) toast(msg);
  closeModal(); await render(true);
  return r;
}

/* Up to 6 known cities matching what was typed; names starting with it come first. */
function citySuggestions(typed) {
  const t = typed.trim().toLowerCase(); if (!t) return [];
  const all = getCities().filter(c => c.toLowerCase().includes(t) && c.toLowerCase() !== t);
  return [...all.filter(c => c.toLowerCase().startsWith(t)), ...all.filter(c => !c.toLowerCase().startsWith(t))].slice(0, 6);
}
function showCitySuggestions(input) {
  const list = input.parentElement.querySelector('.ac-list'), matches = citySuggestions(input.value);
  list.innerHTML = String(html`${matches.map((c, i) => html`<li role="option" id="city-opt-${i}" data-city="${c}">${c}</li>`)}`);
  list.hidden = !matches.length; input.setAttribute('aria-expanded', String(!!matches.length)); input.removeAttribute('aria-activedescendant');
}
function pickCity(input, city) {
  input.value = city;
  const list = input.parentElement.querySelector('.ac-list'); list.hidden = true; list.innerHTML = '';
  input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
}

function setProfileMenu(open) {
  const m = $('.profile-menu'); if (!m) return;
  m.classList.toggle('open', open); m.querySelector('.me').setAttribute('aria-expanded', String(open));
}

Object.assign(A, {
  closeModal, closeBack(el, e) { if (e.target === el) closeModal(); },
  burger(el) { const n = $('.nav'); if (!n) return; const open = n.classList.toggle('open'); el.setAttribute('aria-expanded', String(open)); el.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); },
  profileMenu(el) { setProfileMenu(!el.closest('.profile-menu').classList.contains('open')); },
  async logout() { await api.post('/api/auth/logout'); await refreshSession(); toast('Signed out.'); go('#/'); }
});

export function installListeners() {
  document.addEventListener('click', e => {
    if (!e.target.closest('.profile-menu')) setProfileMenu(false);
    const el = e.target.closest('[data-act]'); if (!el) return;
    const fn = A[el.dataset.act]; if (!fn) return;
    if (el.tagName === 'A' || el.tagName === 'BUTTON') e.preventDefault();
    const pending = fn(el, e);
    // Buttons that call the server stay disabled until it answers.
    if (pending && pending.then && el.tagName === 'BUTTON') { el.disabled = true; pending.finally(() => { el.disabled = false; }); }
  });

  // Submit buttons are disabled while the server is working, so a form can't be sent twice.
  document.addEventListener('submit', async e => {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault(); const fn = F[f.dataset.form]; if (!fn || f.getAttribute('aria-busy') === 'true') return;
    const buttons = [...f.querySelectorAll('button')];
    f.setAttribute('aria-busy', 'true'); buttons.forEach(b => { b.disabled = true; });
    try { await fn(f, new FormData(f)); } finally { f.removeAttribute('aria-busy'); buttons.forEach(b => { b.disabled = false; }); }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset && t.dataset.suggest === 'city') showCitySuggestions(t);
    if (t.classList.contains('ba-range')) t.closest('.ba').style.setProperty('--pos', t.value + '%'); // before/after slider
    const box = t.closest('[data-filters]'); if (box && onInput[box.dataset.filters]) onInput[box.dataset.filters](box);
  });
  document.addEventListener('change', e => { const fn = e.target.id && onChange[e.target.id]; if (fn) fn(e.target); });

  document.addEventListener('keydown', e => {
    const t = e.target;
    if (t.id === 'msgText' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); t.form.requestSubmit(); return; }
    if (t.dataset && t.dataset.suggest === 'city') {
      const list = t.parentElement.querySelector('.ac-list');
      if (!list.hidden) {
        const opts = [...list.children], cur = opts.findIndex(o => o.classList.contains('on'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const next = e.key === 'ArrowDown' ? (cur + 1) % opts.length : (cur - 1 + opts.length) % opts.length;
          opts.forEach((o, i) => o.classList.toggle('on', i === next)); t.setAttribute('aria-activedescendant', opts[next].id); return;
        }
        if (e.key === 'Enter' && cur >= 0) { e.preventDefault(); pickCity(t, opts[cur].dataset.city); return; }
        if (e.key === 'Escape') { pickCity(t, t.value); return; }
      }
    }
    if (e.key !== 'Escape') return;
    if ($('#modalRoot .modal')) closeModal();
    if ($('.profile-menu.open')) { setProfileMenu(false); $('.profile-menu .me').focus(); }
  });

  // mousedown (not click) so a city choice lands before the input loses focus and the list closes.
  document.addEventListener('mousedown', e => { const opt = e.target.closest('.ac-list li'); if (opt) { e.preventDefault(); pickCity(opt.closest('.ac').querySelector('input'), opt.dataset.city); } });
  document.addEventListener('focusout', e => { if (e.target.dataset && e.target.dataset.suggest === 'city') setTimeout(() => pickCity(e.target, e.target.value), 0); });
}
