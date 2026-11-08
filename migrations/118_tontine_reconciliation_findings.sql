-- P057.4: durable, tenant-scoped reconciliation findings.
-- Findings describe provider/internal divergences; they never mutate Financial Core.
CREATE TABLE IF NOT EXISTS tontine_reconciliation_findings (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  payout_id uuid,
  classification text NOT NULL CHECK (classification IN (
    'matched','callback_rejected','payout_intent_missing','amount_mismatch',
    'currency_mismatch','payout_state_mismatch'
  )),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  callback_state text NOT NULL CHECK (callback_state IN ('received','processed','rejected','replayed')),
  payout_state text,
  expected_amount_minor numeric(38,0),
  observed_amount_minor numeric(38,0),
  expected_currency char(3),
  observed_currency char(3),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL,
  last_checked_at timestamptz NOT NULL,
  check_count integer NOT NULL DEFAULT 1 CHECK (check_count > 0),
  resolved_at timestamptz,
  UNIQUE (organization_id,provider,provider_event_id),
  FOREIGN KEY (organization_id,provider,provider_event_id)
    REFERENCES tontine_provider_callback_receipts(organization_id,provider,provider_event_id)
);
CREATE INDEX IF NOT EXISTS idx_tontine_reconciliation_queue
  ON tontine_reconciliation_findings (organization_id,severity,last_checked_at DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tontine_reconciliation_payout
  ON tontine_reconciliation_findings (organization_id,payout_id,last_checked_at DESC);
COMMENT ON TABLE tontine_reconciliation_findings IS
  'Operational reconciliation results only. Never posts, reverses or refunds ledger value.';
