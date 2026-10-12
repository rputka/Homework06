/* Wires the pieces together: database, services, live updates, background queue and workers, storage and the
   HTTP server. Tests build the app the same way with a temporary database. */
import { openDatabase } from './db/index.js';
import { createServices } from './services/index.js';
import { createEvents } from './events.js';
import { createQueue } from './queue.js';
import { createDbStorage } from './storage.js';
import { createHttpServer } from './http/app.js';
import { createEmailWorker } from './workers/email.js';
import { createGeocodeWorker } from './workers/geocode.js';
import { seedDatabase } from './seed/index.js';

export async function createApp(config, { log = console, seed = true } = {}) {
  const db = await openDatabase(config, log);
  const events = createEvents(), queue = createQueue(db, log), storage = createDbStorage(db);
  const services = await createServices({ db, events, queue, storage });
  // First run: load the seed data into an empty database. The lock keeps two servers starting at once from both seeding.
  if (seed) await db.exclusive(async () => { if (await seedDatabase(db)) log.log('Database was empty: loaded seed data (password for seeded accounts: demo1234)'); });

  queue.handle('email', createEmailWorker({ db, config, log }));
  queue.handle('geocode', createGeocodeWorker({ db, config, ctx: { db, events, queue }, log }));
  if (config.runWorkers) queue.start();

  const server = createHttpServer({ config, db, services, events, storage, log });
  return { db, services, queue, events, storage, server, async close() { queue.stop(); server.close(); server.closeAllConnections(); await db.close(); } };
}
