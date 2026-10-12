/* Starts Nearhand: opens (and if needed seeds) the database, starts the background workers and the web server.
   Run with `npm start`, then open http://localhost:3000 */
import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const app = await createApp(config);
const where = config.databaseUrl ? `PostgreSQL at ${new URL(config.databaseUrl).hostname}` : config.dbFile;
app.server.listen(config.port, () => console.log(`Nearhand is running at ${config.production ? config.appUrl : `http://localhost:${config.port}`}  (database: ${where})`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close().catch(() => {}); process.exit(0); });
