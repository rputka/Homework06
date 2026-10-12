/* Database schema, as an ordered list of migrations. Each runs once; the applied count is stored in
   meta.schema_version. To change the schema, append a new migration (never edit an applied one).
   Times are milliseconds since 1970 (INTEGER). JSON columns are noted in comments. */

export const MIGRATIONS = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE users (
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

  CREATE TABLE employer_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company TEXT NOT NULL DEFAULT '',
    about   TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE worker_profiles (
    user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    headline         TEXT    NOT NULL DEFAULT '',
    bio              TEXT    NOT NULL DEFAULT '',
    skills           TEXT    NOT NULL DEFAULT '[]', -- JSON array of strings
    experience_years INTEGER NOT NULL DEFAULT 0,
    experience       TEXT    NOT NULL DEFAULT '',
    hourly_rate      REAL    NOT NULL DEFAULT 0,
    pricing_note     TEXT    NOT NULL DEFAULT ''
  );

  CREATE TABLE categories (
    id         TEXT    PRIMARY KEY,                 -- slug, e.g. "plumbing" or "cat-pool-cleaning"
    name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    icon       TEXT    NOT NULL,                    -- SVG path data
    hue        INTEGER NOT NULL,
    custom     INTEGER NOT NULL DEFAULT 0,          -- 1 when added by an employer
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE worker_categories (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id TEXT    NOT NULL REFERENCES categories(id),
    PRIMARY KEY (user_id, category_id)
  );

  CREATE TABLE cities (
    id         TEXT PRIMARY KEY,                    -- normalized name (see cityKey in shared/constants.js)
    name       TEXT NOT NULL,                       -- "Dallas, TX"
    lat REAL NOT NULL, lon REAL NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE jobs (
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
  CREATE INDEX jobs_by_status   ON jobs(status, created_at);
  CREATE INDEX jobs_by_employer ON jobs(employer_id);
  CREATE INDEX jobs_by_worker   ON jobs(worker_id);

  CREATE TABLE job_history (
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    status TEXT    NOT NULL,
    at     INTEGER NOT NULL
  );
  CREATE INDEX job_history_by_job ON job_history(job_id);

  CREATE TABLE bids (
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
  CREATE INDEX bids_by_worker ON bids(worker_id);

  CREATE TABLE bid_photos (
    bid_id   INTEGER NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    url      TEXT    NOT NULL,
    PRIMARY KEY (bid_id, position)
  );

  CREATE TABLE bid_history (
    bid_id INTEGER NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    type   TEXT    NOT NULL,                        -- bid, revised, counter, accepted-counter, declined-counter, withdrawn
    price  REAL    NOT NULL,
    at     INTEGER NOT NULL
  );
  CREATE INDEX bid_history_by_bid ON bid_history(bid_id);

  CREATE TABLE reviews (
    id         INTEGER PRIMARY KEY,
    job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text       TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (job_id, from_id)
  );
  CREATE INDEX reviews_by_recipient ON reviews(to_id);

  CREATE TABLE transactions (
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

  CREATE TABLE transaction_events (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    type           TEXT    NOT NULL CHECK (type IN ('funded', 'released')),
    at             INTEGER NOT NULL
  );

  CREATE TABLE portfolio_items (
    id          INTEGER PRIMARY KEY,
    worker_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT    NOT NULL CHECK (kind IN ('photo', 'pair')),
    src         TEXT,                               -- photo
    before_url  TEXT, after_url TEXT,               -- before/after pair
    caption     TEXT    NOT NULL DEFAULT '',
    category_id TEXT REFERENCES categories(id),
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX portfolio_by_worker ON portfolio_items(worker_id, created_at);

  CREATE TABLE notifications (
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
  CREATE INDEX notifications_by_user ON notifications(user_id, read, created_at);

  CREATE TABLE conversations (
    id                 INTEGER PRIMARY KEY,
    employer_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    worker_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    employer_last_read INTEGER NOT NULL DEFAULT 0,
    worker_last_read   INTEGER NOT NULL DEFAULT 0,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL,
    UNIQUE (employer_id, worker_id)
  );

  CREATE TABLE messages (
    id              INTEGER PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    from_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text            TEXT    NOT NULL,
    created_at      INTEGER NOT NULL
  );
  CREATE INDEX messages_by_conversation ON messages(conversation_id, created_at);

  CREATE TABLE sessions (
    token      TEXT    PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    pending_id INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- signed up, waiting to verify email
    reset_for  INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- asked for a password reset
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE queue (
    id         INTEGER PRIMARY KEY,
    kind       TEXT    NOT NULL,                    -- email, geocode
    payload    TEXT    NOT NULL,                    -- JSON
    status     TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
    attempts   INTEGER NOT NULL DEFAULT 0,
    run_at     INTEGER NOT NULL,
    last_error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX queue_due ON queue(status, run_at);
  `
];
