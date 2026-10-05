ALTER TABLE commercial_actions
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS commercial_actions_claim_idx
  ON commercial_actions (organization_id, state, scheduled_at, next_attempt_at);
