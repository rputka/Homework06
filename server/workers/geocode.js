/* Background job "geocode": places a city the app hasn't seen before. It looks the city up on OpenStreetMap's free
   Nominatim search (at most one request per second, with an identifying User-Agent, as its usage policy requires),
   saves it, and fills in the map position of every user and job in that city. If no such city exists, the people
   who used it get a notification. */
import { cityKey } from '../../shared/constants.js';
import { nudge, notify } from '../services/common.js';

const STATES = { AL: 1, AK: 1, AZ: 1, AR: 1, CA: 1, CO: 1, CT: 1, DE: 1, DC: 1, FL: 1, GA: 1, HI: 1, ID: 1, IL: 1, IN: 1, IA: 1, KS: 1, KY: 1, LA: 1, ME: 1, MD: 1, MA: 1, MI: 1, MN: 1, MS: 1, MO: 1, MT: 1, NE: 1, NV: 1, NH: 1, NJ: 1, NM: 1, NY: 1, NC: 1, ND: 1, OH: 1, OK: 1, OR: 1, PA: 1, RI: 1, SC: 1, SD: 1, TN: 1, TX: 1, UT: 1, VT: 1, VA: 1, WA: 1, WV: 1, WI: 1, WY: 1, PR: 1 };

export function createGeocodeWorker({ db, config, ctx, log = console }) {
  let last = 0;

  async function search(text) {
    const wait = 1100 - (Date.now() - last); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
    const url = `${config.geocoderUrl}?format=jsonv2&addressdetails=1&limit=1&countrycodes=us&featureType=settlement&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { headers: { 'User-Agent': `Nearhand/1.0 (local marketplace class project; ${config.appUrl})`, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const [hit] = await res.json(); if (!hit) return null;
    const a = hit.address || {}, place = a.city || a.town || a.village || a.hamlet || a.municipality || a.suburb, st = String(a['ISO3166-2-lvl4'] || '').replace('US-', '');
    return place && STATES[st] ? { name: `${place}, ${st}`, lat: +Number(hit.lat).toFixed(5), lon: +Number(hit.lon).toFixed(5) } : null;
  }

  /* Users and jobs whose city matches `key` and that have no map position yet. */
  const waiting = key => ({
    users: db.all('SELECT id, location FROM users WHERE lat IS NULL').filter(r => cityKey(r.location) === key),
    jobs: db.all('SELECT id, location, employer_id, title FROM jobs WHERE lat IS NULL').filter(r => cityKey(r.location) === key)
  });

  return async function geocode({ location }) {
    const key = cityKey(location);
    let city = db.get('SELECT name, lat, lon FROM cities WHERE id = ?', key);
    if (!city) {
      city = await search(location);
      if (!city) {
        const w = waiting(key), owners = new Set([...w.users.map(u => u.id), ...w.jobs.map(j => j.employer_id)]);
        for (const id of owners) notify(ctx, id, 'location', `We couldn't find "${location}" on the map`,
          'Check the spelling of the city and use the City, ST format (for example, Dallas, TX). Until then, it won\'t show on maps or in distance search.', '#/settings');
        log.log(`City lookup: no US city matches "${location}".`);
        return;
      }
      db.tx(() => {
        for (const id of new Set([cityKey(city.name), key])) db.run('INSERT OR IGNORE INTO cities (id, name, lat, lon, created_at) VALUES (?, ?, ?, ?, ?)', id, city.name, city.lat, city.lon, Date.now());
      });
    }
    const w = waiting(key);
    db.tx(() => {
      for (const u of w.users) { const p = nudge(city, 'user' + u.id); db.run('UPDATE users SET location = ?, lat = ?, lon = ? WHERE id = ?', city.name, p.lat, p.lon, u.id); }
      for (const j of w.jobs) { const p = nudge(city, 'job' + j.id); db.run('UPDATE jobs SET location = ?, lat = ?, lon = ? WHERE id = ?', city.name, p.lat, p.lon, j.id); }
    });
  };
}
