ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claimed_by text, ADD COLUMN IF NOT EXISTS claimed_at timestamptz, ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE outbox_events DROP CONSTRAINT IF EXISTS outbox_claim_consistency_check;
ALTER TABLE outbox_events ADD CONSTRAINT outbox_claim_consistency_check CHECK ((claimed_by IS NULL AND claimed_at IS NULL) OR (claimed_by IS NOT NULL AND claimed_at IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_outbox_ready ON outbox_events (next_attempt_at, occurred_at) WHERE published_at IS NULL;