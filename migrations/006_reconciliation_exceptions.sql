CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  kind text NOT NULL CHECK (kind IN ('provider_only','internal_only','amount_mismatch','status_mismatch','currency_mismatch','identity_mismatch','duplicate_provider_event')),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL CHECK (status IN ('open','investigating','resolved','rejected')),
  internal_payment_id uuid, provider_reference text,
  evidence_hash char(64) NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  detected_at timestamptz NOT NULL, assigned_to uuid, resolution_code text, resolved_at timestamptz,
  UNIQUE (organization_id, kind, evidence_hash)
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_exception_queue ON reconciliation_exceptions (organization_id, severity DESC, detected_at) WHERE status IN ('open','investigating');