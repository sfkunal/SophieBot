-- Security hardening: telegram verify poll tokens, rate limits, vote dedup

ALTER TABLE telegram_verify_codes ADD COLUMN poll_token TEXT;

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_user_item
  ON votes(item_type, item_id, user_id);
