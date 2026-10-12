/* The HTTP server: JSON API under /api, live updates at /api/events, uploaded photos under /uploads, and the site
   itself (public/ plus the shared/ modules the browser imports). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { createRateLimiter } from '../lib/rate-limit.js';
import { createSessions } from './sessions.js';
import { routes } from './routes.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon' };
const MAX_BODY = 6 * 1024 * 1024;
const PUBLIC = path.join(ROOT, 'public'), SHARED = path.join(ROOT, 'shared');

/* Security headers for every response. The page may load scripts and styles only from itself and cdnjs (Leaflet),
   fonts from Google Fonts, map tiles from OpenStreetMap, and may not be framed by other sites. */
const SECURITY_HEADERS = {
  'Content-Security-Policy': ["default-src 'self'", "script-src 'self' https://cdnjs.cloudflare.com", "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "img-src 'self' data: https://tile.openstreetmap.org", "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"].join('; '),
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY'
};

export function createHttpServer({ config, db, services, events, storage, log = console }) {
  const sessions = createSessions(db, { days: config.sessionDays, secure: config.secureCookies });
  const limiter = createRateLimiter();
  const table = routes({ services, storage, limiter });
  const compiled = table.map(r => ({ ...r, regex: new RegExp('^' + r.path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$') }));

  const sendJson = (res, status, body) => {
    res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const readJson = req => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new HttpError(413, 'That request is too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new HttpError(400, 'The request was not valid JSON.')); } });
    req.on('error', reject);
  });

  /* Writes must come from this site: a custom header (which other sites can't send without permission) and, when the
     browser sends one, a matching Origin. Together with SameSite cookies this blocks cross-site request forgery. */
  function checkCsrf(req) {
    if (req.headers['x-nearhand'] !== '1') throw new HttpError(403, 'Missing request header. Reload the page and try again.');
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Cross-site requests are not allowed.');
  }

  async function handleApi(req, res, url) {
    const ip = req.socket.remoteAddress || '?';
    if (url.pathname === '/api/events') {
      const session = sessions.load(req);
      if (!session.userId) return sendJson(res, 401, { ok: false, error: 'Sign in to continue.' });
      return events.connect(session.userId, req, res);
    }
    const route = compiled.find(r => r.method === req.method && r.regex.test(url.pathname));
    if (!route) return sendJson(res, compiled.some(r => r.regex.test(url.pathname)) ? 405 : 404, { ok: false, error: 'Not found.' });
    if (req.method !== 'GET') {
      checkCsrf(req);
      if (!limiter.allow('write:' + ip, 120, 60000)) throw new HttpError(429, 'Too many requests. Wait a minute and try again.');
    }
    const session = sessions.load(req);
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readJson(req);
    const result = await route.handler({ session, params: url.pathname.match(route.regex).groups || {}, query: Object.fromEntries(url.searchParams), body, ip });
    sessions.save(session, res);
    sendJson(res, 200, { ok: true, ...result });
  }

  function serveFile(res, file, cache) {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache, 'Content-Length': st.size });
      fs.createReadStream(file).pipe(res);
    });
  }

  /* Static files: uploads, the shared modules, and public/. Paths are resolved and checked so they can't escape. */
  function handleStatic(req, res, url) {
    const upload = storage.fileFor(url.pathname);
    if (upload) return serveFile(res, upload, 'public, max-age=31536000, immutable');
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const [base, sub] = rel.startsWith('/shared/') ? [SHARED, rel.slice('/shared/'.length)] : [PUBLIC, rel.slice(1)];
    const file = path.resolve(base, sub);
    if (!file.startsWith(base + path.sep)) { res.writeHead(404, SECURITY_HEADERS); return res.end(); }
    serveFile(res, file, 'no-cache');
  }

  return http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else if (req.method === 'GET' || req.method === 'HEAD') handleStatic(req, res, url);
      else { res.writeHead(405, SECURITY_HEADERS); res.end(); }
    } catch (err) {
      if (!(err instanceof HttpError)) log.error(err);
      if (!res.headersSent) sendJson(res, err.status || 500, { ok: false, error: err instanceof HttpError ? err.message : 'Something went wrong on the server.', code: err.code });
    }
  });
}
