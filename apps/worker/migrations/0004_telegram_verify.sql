-- Phone verification via Telegram (allowlisted numbers only)

CREATE TABLE IF NOT EXISTS telegram_verify_codes (
  phone_e164 TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_verify_codes_code
  ON telegram_verify_codes(code);
