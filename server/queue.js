/* Background jobs, stored in the database so they survive restarts. Handlers run one job at a time; a failed job is
   retried with exponential backoff (5s, 10s, 20s, ...) up to MAX_ATTEMPTS, unless the error is marked permanent. */
const MAX_ATTEMPTS = 6;

export function createQueue(db, log = console) {
  const handlers = new Map();
  // On Postgres, SKIP LOCKED keeps two servers (e.g. old and new during a deploy) from claiming the same job.
  const claim = `UPDATE queue SET status = 'running', attempts = attempts + 1
    WHERE id = (SELECT id FROM queue WHERE status = 'pending' AND run_at <= ? ORDER BY run_at, id LIMIT 1${db.dialect === 'postgres' ? ' FOR UPDATE SKIP LOCKED' : ''}) RETURNING *`;
  let timer = null, running = false, started = false;

  async function runDue() {
    if (running) return; running = true;
    try {
      for (;;) {
        const job = await db.get(claim, Date.now());
        if (!job) break;
        const handler = handlers.get(job.kind);
        try {
          if (!handler) throw Object.assign(new Error(`No handler for "${job.kind}" jobs`), { permanent: true });
          await handler(JSON.parse(job.payload));
          await db.run("UPDATE queue SET status = 'done', last_error = NULL WHERE id = ?", job.id);
        } catch (err) {
          const giveUp = err.permanent || job.attempts >= MAX_ATTEMPTS;
          await db.run('UPDATE queue SET status = ?, run_at = ?, last_error = ? WHERE id = ?', giveUp ? 'failed' : 'pending', Date.now() + 5000 * 2 ** (job.attempts - 1), String(err.message).slice(0, 500), job.id);
          log.error(`Background ${job.kind} job ${job.id} ${giveUp ? 'failed' : 'will retry'}: ${err.message}`);
        }
      }
    } finally { running = false; }
  }
  /* Kicks off a run outside any transaction the caller is in (the new job is picked up once that commits). */
  const kick = () => db.outside(() => runDue().catch(err => log.error(err)));

  return {
    async add(kind, payload, delayMs = 0) {
      await db.insert('INSERT INTO queue (kind, payload, run_at, created_at) VALUES (?, ?, ?, ?)', kind, JSON.stringify(payload), Date.now() + delayMs, Date.now());
      if (started) db.outside(() => setImmediate(kick));
    },
    handle(kind, fn) { handlers.set(kind, fn); },
    async start(intervalMs = 1000) {
      await db.run("UPDATE queue SET status = 'pending' WHERE status = 'running'"); // jobs interrupted by a restart
      started = true;
      timer = setInterval(kick, intervalMs); timer.unref();
      return runDue();
    },
    stop() { started = false; clearInterval(timer); },
    /* Runs everything that is due now (used by tests). */
    drain: runDue
  };
}
