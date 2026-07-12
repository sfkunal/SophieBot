-- Brain agent D1 schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone_e164 TEXT NOT NULL UNIQUE,
  name TEXT,
  google_refresh_token TEXT,
  prefs_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_e164);

CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  cuisine TEXT,
  location TEXT,
  rationale TEXT,
  vibe TEXT,
  source TEXT,
  notes TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  added_by TEXT,
  added_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (added_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_restaurants_status ON restaurants(status);
CREATE INDEX IF NOT EXISTS idx_restaurants_priority ON restaurants(priority DESC);

CREATE TABLE IF NOT EXISTS watch_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,
  genre TEXT,
  rationale TEXT,
  runtime_min INTEGER,
  platform TEXT,
  mood_tags TEXT,
  notes TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  added_by TEXT,
  added_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (added_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_watch_items_status ON watch_items(status);
CREATE INDEX IF NOT EXISTS idx_watch_items_priority ON watch_items(priority DESC);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL CHECK (item_type IN ('restaurant', 'watch')),
  item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_votes_item ON votes(item_type, item_id);

CREATE TABLE IF NOT EXISTS inbound_messages (
  id TEXT PRIMARY KEY,
  from_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  parsed_intent_json TEXT,
  reply_body TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inbound_messages_phone ON inbound_messages(from_phone);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_created ON inbound_messages(created_at DESC);

CREATE TABLE IF NOT EXISTS calendar_cache (
  user_id TEXT PRIMARY KEY,
  busy_blocks_json TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS phone_verification_codes (
  phone_e164 TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
