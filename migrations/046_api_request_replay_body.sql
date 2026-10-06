-- API request replay response persistence for exactly-once HTTP mutation replay.
ALTER TABLE api_request_deduplication ADD COLUMN IF NOT EXISTS response_body text;
CREATE INDEX IF NOT EXISTS idx_api_dedupe_state ON api_request_deduplication(state,expires_at);
