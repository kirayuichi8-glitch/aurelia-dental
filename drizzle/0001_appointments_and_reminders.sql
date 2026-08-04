ALTER TABLE leads ADD COLUMN preferred_date TEXT;
ALTER TABLE leads ADD COLUMN preferred_time TEXT;
ALTER TABLE leads ADD COLUMN consent_at TEXT;

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Yekaterinburg',
  status TEXT NOT NULL DEFAULT 'requested',
  patient_chat_id TEXT,
  reminder_token TEXT NOT NULL UNIQUE,
  reminder_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question TEXT NOT NULL,
  intent TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appointments_status_starts_at
ON appointments(status, starts_at);

CREATE INDEX IF NOT EXISTS idx_appointments_lead_id
ON appointments(lead_id);

CREATE INDEX IF NOT EXISTS idx_conversation_events_created_at
ON conversation_events(created_at);

PRAGMA optimize;
