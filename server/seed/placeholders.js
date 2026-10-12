/* Generated placeholder images (avatars, work photos, portfolio shots) used by the seed data. */
import { CATS } from '../../shared/constants.js';

export const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

export function portrait(seed) {
  const h = hash(seed);
  const skins = ['#F1C9A5', '#E0AC82', '#C68642', '#8D5524', '#F6D7BE', '#B97A4B'];
  const hairs = ['#2B1B12', '#5A3825', '#1C1C1C', '#B5651D', '#8A8A8A', '#D9B26F'];
  const shirts = ['#2F6F8F', '#B8552E', '#4C7A4F', '#6A4C93', '#C2933A', '#33505A'];
  const skin = skins[h % skins.length], hair = hairs[(h >> 3) % hairs.length], shirt = shirts[(h >> 5) % shirts.length];
  const long = (h >> 7) % 2 === 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="hsl(${h % 360} 40% 80%)"/>` +
    (long ? `<path d="M22 36c0-18 36-18 36 0v22H22z" fill="${hair}"/>` : '') +
    `<path d="M10 80c2-17 14-25 30-25s28 8 30 25z" fill="${shirt}"/><rect x="35" y="44" width="10" height="12" rx="4" fill="${skin}"/>` +
    `<circle cx="40" cy="34" r="14" fill="${skin}"/><path d="M26 33a14 14 0 0 1 28 0c-4-5-8-7-14-7s-10 2-14 7z" fill="${hair}"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
export function workPhoto(cat, i) {
  const c = CATS.find(x => x.id === cat) || CATS[0];
  const h = (c.hue + i * 22) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" fill="hsl(${h} 45% 72%)"/><circle cx="118" cy="40" r="46" fill="hsl(${h} 50% 82%)"/><rect y="112" width="160" height="48" fill="hsl(${h} 35% 55%)"/><path d="${c.icon}" transform="translate(50 36) scale(2.5)" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><text x="80" y="143" font-size="13" text-anchor="middle" fill="#fff" font-family="sans-serif">Past project ${i + 1}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/* Portfolio sample images (320x240): a finished-work photo, and matching "before" (dull, worn) and "after" (fresh) shots. */
export function portfolioPhoto(cat, i, stage) {
  const c = CATS.find(x => x.id === cat) || CATS[0];
  const h = (c.hue + i * 37) % 360, before = stage === 'before';
  const bg = before ? `hsl(${h} 8% 62%)` : `hsl(${h} 42% 74%)`, ground = before ? `hsl(${h} 6% 45%)` : `hsl(${h} 38% 52%)`;
  const wear = before ? '<path d="M40 60l30 22-12 18 26 30M220 40l-18 30 22 14-10 26M120 150l40 10 20-16" stroke="#00000033" stroke-width="3" fill="none"/><circle cx="250" cy="150" r="22" fill="#00000018"/><circle cx="80" cy="170" r="14" fill="#00000014"/>' : `<circle cx="250" cy="58" r="40" fill="hsl(${h} 50% 84%)"/>`;
  const label = stage ? (before ? 'Before' : 'After') : `Project ${i + 1}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><rect width="320" height="240" fill="${bg}"/>${wear}<rect y="176" width="320" height="64" fill="${ground}"/>` +
    `<path d="${c.icon}" transform="translate(124 52) scale(3)" fill="none" stroke="${before ? '#ffffffaa' : '#fff'}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<rect x="12" y="12" rx="4" width="${label.length * 9 + 20}" height="26" fill="#00000055"/><text x="22" y="30" font-size="14" fill="#fff" font-family="sans-serif" font-weight="600">${label}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
