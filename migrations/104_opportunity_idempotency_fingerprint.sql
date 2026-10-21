-- OP-1302: bind a tenant-scoped idempotency key to the exact command context.
-- Existing events remain readable: their fingerprint is NULL and replay is checked
-- against the explicit legacy binding columns in the repository.
ALTER TABLE opportunity_state_events
  ADD COLUMN IF NOT EXISTS approval_id text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

ALTER TABLE opportunity_state_events
  ADD CONSTRAINT opportunity_state_events_request_fingerprint_format
  CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[0-9a-f]{64}$');
