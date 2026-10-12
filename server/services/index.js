/* All services, sharing one context: { db, events (live updates), queue (background jobs), storage (uploads) }. */
import { createAccounts } from './accounts.js';
import { createJobs } from './jobs.js';
import { createProfiles } from './profiles.js';
import { createMessaging } from './messaging.js';
import { createNotifications } from './notifications.js';
import { ensureBuiltins } from './common.js';

export async function createServices({ db, events, queue, storage }) {
  const ctx = { db, events, queue, storage, services: null };
  ctx.services = {
    accounts: createAccounts(ctx), jobs: createJobs(ctx), profiles: createProfiles(ctx),
    messaging: createMessaging(ctx), notifications: createNotifications(ctx)
  };
  await ensureBuiltins(db);
  return ctx.services;
}
