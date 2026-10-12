/* Server settings, read from environment variables (a .env file is loaded by `npm start`). See .env.example. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(env = process.env) {
  const port = Number(env.PORT) || 3000;
  return {
    port,
    production: env.NODE_ENV === 'production',
    // PostgreSQL when DATABASE_URL is set (e.g. Aiven); otherwise a local SQLite file.
    databaseUrl: env.DATABASE_URL || null,
    dbCa: env.AIVEN_CA_CERT ? env.AIVEN_CA_CERT.replace(/\\n/g, '\n') : null, // PEM; "\n" escapes allowed for one-line env values
    pgPoolMax: env.PG_POOL_MAX,
    pgSchema: env.PG_SCHEMA || null, // tests only: run in a throwaway schema
    dbFile: env.DB_FILE || path.join(ROOT, 'server', 'data', 'nearhand.db'),
    appUrl: (env.APP_URL || `http://localhost:${port}`).replace(/\/$/, ''),
    sessionDays: Number(env.SESSION_DAYS) || 30,
    secureCookies: env.SECURE_COOKIES === '1' || (env.APP_URL || '').startsWith('https://'),
    email: { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, redirectTo: env.EMAIL_REDIRECT_TO, apiUrl: env.RESEND_API_URL || 'https://api.resend.com/emails' },
    geocoderUrl: env.GEOCODER_URL || 'https://nominatim.openstreetmap.org/search',
    runWorkers: env.RUN_WORKERS !== '0' // background queue workers (tests turn them off)
  };
}
