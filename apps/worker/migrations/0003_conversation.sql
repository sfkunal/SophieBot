-- Conversation memory for multi-turn follow-ups

CREATE TABLE IF NOT EXISTS conversation_state (
  sender_key TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  pending_intent TEXT NOT NULL,
  pending_entities_json TEXT NOT NULL,
  missing_fields_json TEXT NOT NULL,
  follow_up_prompt TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_state_expires
  ON conversation_state(expires_at);
