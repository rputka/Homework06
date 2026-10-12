/* Starts Nearhand: opens (and if needed seeds) the database, starts the background workers and the web server.
   Run with `npm start`, then open http://localhost:3000 */
import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const app = createApp(config);
app.server.listen(config.port, () => console.log(`Nearhand is running at http://localhost:${config.port}  (database: ${config.dbFile})`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { app.close(); process.exit(0); });
