/* Safe HTML templates. html`<p>${text}</p>` escapes every interpolated value unless it is itself html`...` (or
   raw()), and arrays are joined, so user content can't inject markup by accident. */
class SafeHtml {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = v => String(v).replace(/[&<>"']/g, c => ESC[c]);
const part = v => (v == null || v === false ? '' : v instanceof SafeHtml ? v.s : Array.isArray(v) ? v.map(part).join('') : escapeHtml(v));

export const html = (strings, ...values) => new SafeHtml(strings.reduce((out, s, i) => out + s + (i < values.length ? part(values[i]) : ''), ''));
/* Trusted markup (for constants such as icon SVGs). Never pass user content to raw(). */
export const raw = s => new SafeHtml(String(s));
