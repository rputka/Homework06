/* Wires the pieces together: database, services, live updates, background queue and workers, storage and the
   HTTP server. Tests build the app the same way with a temporary database. */
import { openDatabase } from './db/index.js';
import { createServices } from './services/index.js';
import { createEvents } from './events.js';
import { createQueue } from './queue.js';
import { createLocalStorage } from './storage.js';
import { createHttpServer } from './http/app.js';
import { createEmailWorker } from './workers/email.js';
import { createGeocodeWorker } from './workers/geocode.js';
import { seedDatabase } from './seed/index.js';

export function createApp(config, { log = console, seed = true } = {}) {
  const db = openDatabase(config.dbFile);
  const events = createEvents(), queue = createQueue(db, log), storage = createLocalStorage(config.uploadsDir);
  const services = createServices({ db, events, queue, storage });
  if (seed && !db.get('SELECT 1 FROM users LIMIT 1')) { log.log('Database is empty: loading seed data (password for seeded accounts: demo1234)'); seedDatabase(db); }

  queue.handle('email', createEmailWorker({ db, config, log }));
  queue.handle('geocode', createGeocodeWorker({ db, config, ctx: { db, events, queue }, log }));
  if (config.runWorkers) queue.start();

  const server = createHttpServer({ config, db, services, events, storage, log });
  return { db, services, queue, events, storage, server, close() { queue.stop(); server.close(); db.close(); } };
}
