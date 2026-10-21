-- OP-1300: durable retry and quarantine metadata for the Opportunity outbox.
ALTER TABLE opportunity_event_outbox
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_opportunity_outbox_quarantine
  ON opportunity_event_outbox (dead_lettered_at, occurred_at)
  WHERE published_at IS NULL AND dead_lettered_at IS NOT NULL;
