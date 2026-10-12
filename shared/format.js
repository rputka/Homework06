/* Formatting helpers shared by the browser and the server. */

export const money = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const fmtDate = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const ago = ts => {
  const m = (Date.now() - ts) / 60000;
  if (m < 60) return 'just now';
  if (m < 1440) return Math.floor(m / 60) + 'h ago';
  if (m < 43200) return Math.floor(m / 1440) + 'd ago';
  return fmtDate(ts);
};
export const first = n => String(n || '').split(' ')[0];
export const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

/* Approximate straight-line miles between two [lat, lon] points; Infinity when either is missing. */
export function milesBetween(p, q) {
  if (!p || !q) return Infinity;
  const rad = d => d * Math.PI / 180, dLat = rad(q[0] - p[0]), dLon = rad(q[1] - p[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p[0])) * Math.cos(rad(q[0])) * Math.sin(dLon / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.sqrt(h));
}
