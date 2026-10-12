/* DOM helpers: element lookup, toasts and modal dialogs. */
import { html } from './html.js';

export const $ = s => document.querySelector(s);

export function toast(message, kind) {
  const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = message;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3600);
}

/* Opens a dialog. title is text; body is html`...`. */
export function openModal(title, body, wide) {
  $('#modalRoot').innerHTML = String(html`<div class="modal-back" data-act="closeBack"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mt">
    <button class="modal-x" data-act="closeModal" aria-label="Close">×</button><h3 id="mt">${title}</h3>${body}</div></div>`);
  const f = $('#modalRoot input:not([type=hidden]), #modalRoot textarea, #modalRoot .btn-primary, #modalRoot .btn-accent');
  if (f) f.focus();
}
export const closeModal = () => { $('#modalRoot').innerHTML = ''; };
