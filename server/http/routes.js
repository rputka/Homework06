/* The API endpoints. Each handler receives { session, params, query, body, ip } and returns the response data
   (errors are thrown as HttpError by the services). Rate limits guard sign-in, sign-up, resets, uploads and messages. */
import { HttpError } from '../lib/errors.js';
import { MAX_IMAGE_BYTES } from '../storage.js';

export function routes({ services, storage, limiter }) {
  const { accounts, jobs, profiles, messaging, notifications } = services;
  const limit = (key, max, windowMs, message = 'Too many attempts. Wait a few minutes and try again.') => { if (!limiter.allow(key, max, windowMs)) throw new HttpError(429, message); };
  const userKey = s => 'user:' + (s.userId || 'anon');

  return [
    // Session and accounts
    { method: 'GET', path: '/api/session', handler: ({ session }) => accounts.sessionInfo(session) },
    { method: 'POST', path: '/api/auth/signup', handler: ({ session, body, ip }) => { limit('signup:' + ip, 10, 3600000); return accounts.signup(session, body); } },
    { method: 'POST', path: '/api/auth/verify', handler: ({ session }) => accounts.verify(session) },
    { method: 'POST', path: '/api/auth/login', handler: ({ session, body, ip }) => { limit('login:' + ip + ':' + String(body.email || '').toLowerCase(), 10, 600000); return accounts.login(session, body.email, body.password); } },
    { method: 'POST', path: '/api/auth/logout', handler: ({ session }) => accounts.logout(session) },
    { method: 'POST', path: '/api/auth/forgot', handler: ({ session, body, ip }) => { limit('forgot:' + ip, 10, 3600000); return accounts.requestReset(session, body.email); } },
    { method: 'POST', path: '/api/auth/reset', handler: ({ session, body }) => accounts.resetPassword(session, body.password) },

    // Jobs and the job workflow
    { method: 'GET', path: '/api/jobs', handler: ({ session, query }) => jobs.listOpen(session, query) },
    { method: 'POST', path: '/api/jobs', handler: ({ session, body }) => jobs.save(session, null, body) },
    { method: 'GET', path: '/api/jobs/:id', handler: ({ session, params }) => jobs.get(session, params.id) },
    { method: 'PUT', path: '/api/jobs/:id', handler: ({ session, params, body }) => jobs.save(session, params.id, body) },
    { method: 'DELETE', path: '/api/jobs/:id', handler: ({ session, params }) => jobs.remove(session, params.id) },
    { method: 'POST', path: '/api/jobs/:id/bids', handler: ({ session, params, body }) => jobs.bid(session, params.id, body) },
    { method: 'POST', path: '/api/jobs/:id/fund', handler: ({ session, params }) => jobs.fund(session, params.id) },
    { method: 'POST', path: '/api/jobs/:id/start', handler: ({ session, params }) => jobs.start(session, params.id) },
    { method: 'POST', path: '/api/jobs/:id/complete', handler: ({ session, params, body }) => jobs.complete(session, params.id, body.note) },
    { method: 'POST', path: '/api/jobs/:id/confirm', handler: ({ session, params }) => jobs.confirm(session, params.id) },
    { method: 'POST', path: '/api/jobs/:id/reviews', handler: ({ session, params, body }) => jobs.review(session, params.id, body.rating, body.text) },
    { method: 'POST', path: '/api/bids/:id/withdraw', handler: ({ session, params }) => jobs.withdraw(session, params.id) },
    { method: 'POST', path: '/api/bids/:id/counter', handler: ({ session, params, body }) => jobs.counter(session, params.id, body.price, body.note) },
    { method: 'POST', path: '/api/bids/:id/respond', handler: ({ session, params, body }) => jobs.respondCounter(session, params.id, !!body.accept) },
    { method: 'POST', path: '/api/bids/:id/hire', handler: ({ session, params }) => jobs.hire(session, params.id) },
    { method: 'GET', path: '/api/dashboard', handler: ({ session }) => jobs.dashboard(session) },
    { method: 'GET', path: '/api/payments', handler: ({ session }) => jobs.payments(session) },

    // People, profiles and settings
    { method: 'GET', path: '/api/workers', handler: ({ session, query }) => profiles.listWorkers(session, query) },
    { method: 'GET', path: '/api/users/:id', handler: ({ session, params }) => profiles.get(session, params.id) },
    { method: 'GET', path: '/api/settings', handler: ({ session }) => profiles.settings(session) },
    { method: 'PUT', path: '/api/settings', handler: ({ session, body }) => profiles.saveSettings(session, body) },
    { method: 'POST', path: '/api/portfolio', handler: ({ session, body }) => profiles.addPortfolioItem(session, body) },
    { method: 'DELETE', path: '/api/portfolio/:id', handler: ({ session, params }) => profiles.removePortfolioItem(session, params.id) },
    { method: 'GET', path: '/api/categories', handler: () => profiles.categories() },
    { method: 'GET', path: '/api/cities', handler: () => profiles.cities() },

    // Photos: the browser sends a compressed image as a data: URL and gets back its /uploads/... URL.
    { method: 'POST', path: '/api/uploads', handler: async ({ session, body }) => {
      if (!session.userId) throw new HttpError(401, 'Sign in to continue.');
      limit(userKey(session) + ':upload', 60, 600000, 'Too many uploads. Wait a few minutes and try again.');
      const m = /^data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
      if (!m) throw new HttpError(400, 'Upload a JPEG, PNG, WebP or GIF image.');
      if (m[1].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new HttpError(413, 'That image is too large. Try a smaller photo.'); // checked before decoding
      return { url: await storage.put(Buffer.from(m[1], 'base64')) };
    } },

    // Notifications and messages
    { method: 'GET', path: '/api/notifications', handler: ({ session }) => notifications.list(session) },
    { method: 'POST', path: '/api/notifications/read', handler: ({ session, body }) => notifications.markRead(session, body.ids) },
    { method: 'GET', path: '/api/conversations', handler: ({ session }) => messaging.list(session) },
    { method: 'POST', path: '/api/conversations', handler: ({ session, body }) => messaging.start(session, body.userId) },
    { method: 'GET', path: '/api/conversations/:id', handler: ({ session, params }) => messaging.get(session, params.id) },
    { method: 'POST', path: '/api/conversations/:id/messages', handler: ({ session, params, body }) => {
      limit(userKey(session) + ':message', 30, 60000, 'You are sending messages too quickly. Wait a moment.');
      return messaging.send(session, params.id, body.text);
    } },
    { method: 'POST', path: '/api/conversations/:id/read', handler: ({ session, params }) => messaging.markRead(session, params.id) }
  ];
}
