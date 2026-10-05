CREATE TABLE IF NOT EXISTS payment_intents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  payer_account_id uuid NOT NULL,
  payee_account_id uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (length(currency) BETWEEN 3 AND 8),
  state text NOT NULL CHECK (state IN ('pending_approval','approved','rejected','settled','failed')),
  requires_human_approval boolean NOT NULL DEFAULT true,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (organization_id,idempotency_key),
  CHECK (payer_account_id <> payee_account_id),
  CHECK ((state='approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR state<>'approved')
);
CREATE INDEX IF NOT EXISTS payment_intents_org_state_idx ON payment_intents(organization_id,state,created_at DESC);
