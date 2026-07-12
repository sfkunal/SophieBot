-- Telegram channel support

ALTER TABLE users ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE users ADD COLUMN telegram_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_chat_id
  ON users(telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

ALTER TABLE inbound_messages ADD COLUMN channel TEXT NOT NULL DEFAULT 'sms';

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user
  ON telegram_link_codes(user_id);
