/* Server settings, read from environment variables (a .env file is loaded by `npm start`). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(env = process.env) {
  const port = Number(env.PORT) || 3000;
  const dbFile = env.DB_FILE || path.join(ROOT, 'server', 'data', 'nearhand.db');
  return {
    port,
    dbFile,
    uploadsDir: env.UPLOADS_DIR || path.join(path.dirname(dbFile === ':memory:' ? path.join(ROOT, 'server', 'data', 'x') : dbFile), 'uploads'),
    appUrl: (env.APP_URL || `http://localhost:${port}`).replace(/\/$/, ''),
    sessionDays: Number(env.SESSION_DAYS) || 30,
    secureCookies: env.SECURE_COOKIES === '1' || (env.APP_URL || '').startsWith('https://'),
    email: { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, redirectTo: env.EMAIL_REDIRECT_TO, apiUrl: env.RESEND_API_URL || 'https://api.resend.com/emails' },
    geocoderUrl: env.GEOCODER_URL || 'https://nominatim.openstreetmap.org/search',
    runWorkers: env.RUN_WORKERS !== '0' // background queue workers (tests turn them off)
  };
}
