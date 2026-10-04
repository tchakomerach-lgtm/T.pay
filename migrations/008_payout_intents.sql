CREATE TABLE IF NOT EXISTS payout_intents (
  payout_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  cycle_id text NOT NULL,
  beneficiary_id text NOT NULL,
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (length(currency) BETWEEN 3 AND 3),
  destination_ref text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft','pending_kyc','pending_approval','approved','initiated','confirmed','failed','reversed','cancelled')),
  idempotency_key text NOT NULL,
  requires_human_approval boolean NOT NULL DEFAULT true,
  kyc_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  UNIQUE (organization_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS payout_approvals (
  payout_id uuid NOT NULL REFERENCES payout_intents(payout_id),
  approver_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approve','reject')),
  reason text,
  approved_at timestamptz NOT NULL,
  PRIMARY KEY (payout_id,approver_id)
);
CREATE INDEX IF NOT EXISTS idx_payout_intents_org_state ON payout_intents(organization_id,state,created_at);
