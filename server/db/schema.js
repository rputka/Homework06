/* Database schema, as an ordered list of migrations for each database engine. Each runs once; the applied count is
   stored in meta.schema_version. To change the schema, append a new migration to BOTH lists (never edit an applied
   one beyond making it idempotent). Times are milliseconds since 1970 (INTEGER in SQLite, BIGINT in Postgres).
   JSON columns are noted in comments. Case-insensitive lookups (emails, category names) use lower(...) so the same
   queries work on both engines. */

const SQLITE_1 = `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    role          TEXT    NOT NULL CHECK (role IN ('employer', 'worker')),
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,                 -- scrypt:<salt>:<hash>
    phone         TEXT    NOT NULL,
    location      TEXT    NOT NULL,                 -- "City, ST"
    lat REAL, lon REAL,                             -- approximate position near the city center
    verified      INTEGER NOT NULL DEFAULT 0,
    avatar        TEXT,                             -- image URL
    email_prefs   TEXT    NOT NULL DEFAULT '{}',    -- JSON {notificationType: false} for emails switched off
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS employer_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company TEXT NOT NULL DEFAULT '',
    about   TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS worker_profiles (
    user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    headline         TEXT    NOT NULL DEFAULT '',
    bio              TEXT    NOT NULL DEFAULT '',
    skills           TEXT    NOT NULL DEFAULT '[]', -- JSON array of strings
    experience_years INTEGER NOT NULL DEFAULT 0,
    experience       TEXT    NOT NULL DEFAULT '',
    hourly_rate      REAL    NOT NULL DEFAULT 0,
    pricing_note     TEXT    NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS categories (
    id         TEXT    PRIMARY KEY,                 -- slug, e.g. "plumbing" or "cat-pool-cleaning"
    name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    icon       TEXT    NOT NULL,                    -- SVG path data
    hue        INTEGER NOT NULL,
    custom     INTEGER NOT NULL DEFAULT 0,          -- 1 when added by an employer
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS worker_categories (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id TEXT    NOT NULL REFERENCES categories(id),
    PRIMARY KEY (user_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS cities (
    id         TEXT PRIMARY KEY,                    -- normalized name (see cityKey in shared/constants.js)
    name       TEXT NOT NULL,                       -- "Dallas, TX"
    lat REAL NOT NULL, lon REAL NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id              INTEGER PRIMARY KEY,
    employer_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT    NOT NULL,
    description     TEXT    NOT NULL,
    category_id     TEXT    NOT NULL REFERENCES categories(id),
    location        TEXT    NOT NULL,
    lat REAL, lon REAL,
    experience      TEXT    NOT NULL,
    budget_min      REAL    NOT NULL,
    budget_max      REAL    NOT NULL,
    schedule        TEXT,                           -- JSON (see shared/schedule.js) or NULL for flexible
    status          TEXT    NOT NULL,
    worker_id       INTEGER REFERENCES users(id),
    agreed_price    REAL,
    completion_note TEXT    NOT NULL DEFAULT '',
    created_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS jobs_by_status   ON jobs(status, created_at);
  CREATE INDEX IF NOT EXISTS jobs_by_employer ON jobs(employer_id);
  CREATE INDEX IF NOT EXISTS jobs_by_worker   ON jobs(worker_id);

  CREATE TABLE IF NOT EXISTS job_history (
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    status TEXT    NOT NULL,
    at     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS job_history_by_job ON job_history(job_id);

  CREATE TABLE IF NOT EXISTS bids (
    id             INTEGER PRIMARY KEY,
    job_id         INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    worker_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    price          REAL    NOT NULL,
    message        TEXT    NOT NULL,
    status         TEXT    NOT NULL CHECK (status IN ('active', 'accepted', 'rejected', 'withdrawn')),
    counter_price  REAL,
    counter_note   TEXT,
    counter_status TEXT CHECK (counter_status IN ('pending', 'accepted', 'declined')),
    counter_at     INTEGER,
    created_at     INTEGER NOT NULL,
    UNIQUE (job_id, worker_id)
  );
  CREATE INDEX IF NOT EXISTS bids_by_worker ON bids(worker_id);

  CREATE TABLE IF NOT EXISTS bid_photos (
    bid_id   INTEGER NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    url      TEXT    NOT NULL,
    PRIMARY KEY (bid_id, position)
  );

  CREATE TABLE IF NOT EXISTS bid_history (
    bid_id INTEGER NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    type   TEXT    NOT NULL,                        -- bid, revised, counter, accepted-counter, declined-counter, withdrawn
    price  REAL    NOT NULL,
    at     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS bid_history_by_bid ON bid_history(bid_id);

  CREATE TABLE IF NOT EXISTS reviews (
    id         INTEGER PRIMARY KEY,
    job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text       TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (job_id, from_id)
  );
  CREATE INDEX IF NOT EXISTS reviews_by_recipient ON reviews(to_id);

  CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY,                -- shown as TX-<1000 + id>
    job_id      INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    employer_id INTEGER NOT NULL REFERENCES users(id),
    worker_id   INTEGER NOT NULL REFERENCES users(id),
    amount      REAL    NOT NULL,
    fee         REAL    NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL CHECK (status IN ('held', 'released')),
    card        TEXT    NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transaction_events (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    type           TEXT    NOT NULL CHECK (type IN ('funded', 'released')),
    at             INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio_items (
    id          INTEGER PRIMARY KEY,
    worker_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT    NOT NULL CHECK (kind IN ('photo', 'pair')),
    src         TEXT,                               -- photo
    before_url  TEXT, after_url TEXT,               -- before/after pair
    caption     TEXT    NOT NULL DEFAULT '',
    category_id TEXT REFERENCES categories(id),
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS portfolio_by_worker ON portfolio_items(worker_id, created_at);

  CREATE TABLE IF NOT EXISTS notifications (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type         TEXT    NOT NULL,                  -- a NOTIFY_TYPES key
    title        TEXT    NOT NULL,
    body         TEXT    NOT NULL,
    link         TEXT    NOT NULL DEFAULT '',
    read         INTEGER NOT NULL DEFAULT 0,
    email_status TEXT    NOT NULL DEFAULT 'pending', -- pending, sent, skipped, not-configured, failed, sample
    email_error  TEXT,
    email_at     INTEGER,
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notifications_by_user ON notifications(user_id, read, created_at);

  CREATE TABLE IF NOT EXISTS conversations (
    id                 INTEGER PRIMARY KEY,
    employer_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    worker_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    employer_last_read INTEGER NOT NULL DEFAULT 0,
    worker_last_read   INTEGER NOT NULL DEFAULT 0,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL,
    UNIQUE (employer_id, worker_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    from_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text            TEXT    NOT NULL,
    created_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages(conversation_id, created_at);

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT    PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    pending_id INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- signed up, waiting to verify email
    reset_for  INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- asked for a password reset
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS queue (
    id         INTEGER PRIMARY KEY,
    kind       TEXT    NOT NULL,                    -- email, geocode
    payload    TEXT    NOT NULL,                    -- JSON
    status     TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
    attempts   INTEGER NOT NULL DEFAULT 0,
    run_at     INTEGER NOT NULL,
    last_error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS queue_due ON queue(status, run_at);
  `;

/* The same tables for PostgreSQL. Differences: identity ids, BIGINT for ids and times, DOUBLE PRECISION for REAL,
   unique indexes on lower(...) instead of COLLATE NOCASE, and an explicit rowid on the history tables (SQLite has
   one built in), which queries use to keep events with the same timestamp in insertion order. */
const ID = 'BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY';
const POSTGRES_1 = `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS users (
    id            ${ID},
    role          TEXT    NOT NULL CHECK (role IN ('employer', 'worker')),
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    phone         TEXT    NOT NULL,
    location      TEXT    NOT NULL,
    lat DOUBLE PRECISION, lon DOUBLE PRECISION,
    verified      INTEGER NOT NULL DEFAULT 0,
    avatar        TEXT,
    email_prefs   TEXT    NOT NULL DEFAULT '{}',
    created_at    BIGINT  NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (lower(email));

  CREATE TABLE IF NOT EXISTS employer_profiles (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company TEXT NOT NULL DEFAULT '',
    about   TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS worker_profiles (
    user_id          BIGINT  PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    headline         TEXT    NOT NULL DEFAULT '',
    bio              TEXT    NOT NULL DEFAULT '',
    skills           TEXT    NOT NULL DEFAULT '[]',
    experience_years INTEGER NOT NULL DEFAULT 0,
    experience       TEXT    NOT NULL DEFAULT '',
    hourly_rate      DOUBLE PRECISION NOT NULL DEFAULT 0,
    pricing_note     TEXT    NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS categories (
    id         TEXT    PRIMARY KEY,
    name       TEXT    NOT NULL,
    icon       TEXT    NOT NULL,
    hue        INTEGER NOT NULL,
    custom     INTEGER NOT NULL DEFAULT 0,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at BIGINT  NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS categories_name ON categories (lower(name));

  CREATE TABLE IF NOT EXISTS worker_categories (
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id TEXT   NOT NULL REFERENCES categories(id),
    PRIMARY KEY (user_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS cities (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL, lon DOUBLE PRECISION NOT NULL,
    created_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id              ${ID},
    employer_id     BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT    NOT NULL,
    description     TEXT    NOT NULL,
    category_id     TEXT    NOT NULL REFERENCES categories(id),
    location        TEXT    NOT NULL,
    lat DOUBLE PRECISION, lon DOUBLE PRECISION,
    experience      TEXT    NOT NULL,
    budget_min      DOUBLE PRECISION NOT NULL,
    budget_max      DOUBLE PRECISION NOT NULL,
    schedule        TEXT,
    status          TEXT    NOT NULL,
    worker_id       BIGINT REFERENCES users(id),
    agreed_price    DOUBLE PRECISION,
    completion_note TEXT    NOT NULL DEFAULT '',
    created_at      BIGINT  NOT NULL
  );
  CREATE INDEX IF NOT EXISTS jobs_by_status   ON jobs(status, created_at);
  CREATE INDEX IF NOT EXISTS jobs_by_employer ON jobs(employer_id);
  CREATE INDEX IF NOT EXISTS jobs_by_worker   ON jobs(worker_id);

  CREATE TABLE IF NOT EXISTS job_history (
    rowid  BIGINT GENERATED ALWAYS AS IDENTITY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    status TEXT   NOT NULL,
    at     BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS job_history_by_job ON job_history(job_id);

  CREATE TABLE IF NOT EXISTS bids (
    id             ${ID},
    job_id         BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    worker_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    price          DOUBLE PRECISION NOT NULL,
    message        TEXT   NOT NULL,
    status         TEXT   NOT NULL CHECK (status IN ('active', 'accepted', 'rejected', 'withdrawn')),
    counter_price  DOUBLE PRECISION,
    counter_note   TEXT,
    counter_status TEXT CHECK (counter_status IN ('pending', 'accepted', 'declined')),
    counter_at     BIGINT,
    created_at     BIGINT NOT NULL,
    UNIQUE (job_id, worker_id)
  );
  CREATE INDEX IF NOT EXISTS bids_by_worker ON bids(worker_id);

  CREATE TABLE IF NOT EXISTS bid_photos (
    bid_id   BIGINT  NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    url      TEXT    NOT NULL,
    PRIMARY KEY (bid_id, position)
  );

  CREATE TABLE IF NOT EXISTS bid_history (
    rowid  BIGINT GENERATED ALWAYS AS IDENTITY,
    bid_id BIGINT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    type   TEXT   NOT NULL,
    price  DOUBLE PRECISION NOT NULL,
    at     BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS bid_history_by_bid ON bid_history(bid_id);

  CREATE TABLE IF NOT EXISTS reviews (
    id         ${ID},
    job_id     BIGINT  NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    from_id    BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id      BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text       TEXT    NOT NULL,
    created_at BIGINT  NOT NULL,
    UNIQUE (job_id, from_id)
  );
  CREATE INDEX IF NOT EXISTS reviews_by_recipient ON reviews(to_id);

  CREATE TABLE IF NOT EXISTS transactions (
    id          ${ID},
    job_id      BIGINT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    employer_id BIGINT NOT NULL REFERENCES users(id),
    worker_id   BIGINT NOT NULL REFERENCES users(id),
    amount      DOUBLE PRECISION NOT NULL,
    fee         DOUBLE PRECISION NOT NULL DEFAULT 0,
    status      TEXT   NOT NULL CHECK (status IN ('held', 'released')),
    card        TEXT   NOT NULL,
    created_at  BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transaction_events (
    rowid          BIGINT GENERATED ALWAYS AS IDENTITY,
    transaction_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    type           TEXT   NOT NULL CHECK (type IN ('funded', 'released')),
    at             BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio_items (
    id          ${ID},
    worker_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT   NOT NULL CHECK (kind IN ('photo', 'pair')),
    src         TEXT,
    before_url  TEXT, after_url TEXT,
    caption     TEXT   NOT NULL DEFAULT '',
    category_id TEXT REFERENCES categories(id),
    created_at  BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS portfolio_by_worker ON portfolio_items(worker_id, created_at);

  CREATE TABLE IF NOT EXISTS notifications (
    id           ${ID},
    user_id      BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type         TEXT    NOT NULL,
    title        TEXT    NOT NULL,
    body         TEXT    NOT NULL,
    link         TEXT    NOT NULL DEFAULT '',
    read         INTEGER NOT NULL DEFAULT 0,
    email_status TEXT    NOT NULL DEFAULT 'pending',
    email_error  TEXT,
    email_at     BIGINT,
    created_at   BIGINT  NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notifications_by_user ON notifications(user_id, read, created_at);

  CREATE TABLE IF NOT EXISTS conversations (
    id                 ${ID},
    employer_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    worker_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    employer_last_read BIGINT NOT NULL DEFAULT 0,
    worker_last_read   BIGINT NOT NULL DEFAULT 0,
    created_at         BIGINT NOT NULL,
    updated_at         BIGINT NOT NULL,
    UNIQUE (employer_id, worker_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              ${ID},
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    from_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text            TEXT   NOT NULL,
    created_at      BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages(conversation_id, created_at);

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT   PRIMARY KEY,
    user_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
    pending_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reset_for  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS queue (
    id         ${ID},
    kind       TEXT    NOT NULL,
    payload    TEXT    NOT NULL,
    status     TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
    attempts   INTEGER NOT NULL DEFAULT 0,
    run_at     BIGINT  NOT NULL,
    last_error TEXT,
    created_at BIGINT  NOT NULL
  );
  CREATE INDEX IF NOT EXISTS queue_due ON queue(status, run_at);
  `;

/* Uploaded photos live in the database, so they survive hosts whose disk is wiped on restart (like Render's free
   tier). name is the content-hash file name used in /uploads/<name> URLs. Only the photo route reads `bytes`. */
const uploads = blob => `
  CREATE TABLE IF NOT EXISTS uploads (
    name       TEXT PRIMARY KEY,
    type       TEXT NOT NULL,                       -- image/jpeg, image/png, image/webp or image/gif
    size       INTEGER NOT NULL,
    bytes      ${blob} NOT NULL,
    created_at ${blob === 'BLOB' ? 'INTEGER' : 'BIGINT'} NOT NULL
  );`;

export const MIGRATIONS = {
  sqlite: [SQLITE_1, uploads('BLOB')],
  postgres: [POSTGRES_1, uploads('BYTEA')]
};

/* Every table, children first, for npm run reset-db. */
export const TABLES = ['uploads', 'queue', 'sessions', 'messages', 'conversations', 'notifications', 'portfolio_items', 'transaction_events', 'transactions',
  'reviews', 'bid_history', 'bid_photos', 'bids', 'job_history', 'jobs', 'cities', 'worker_categories', 'categories', 'worker_profiles', 'employer_profiles', 'users', 'meta'];
