-- L12.5: durable reconciliation jobs and disaster-recovery state transitions.
CREATE TABLE IF NOT EXISTS operational_reconciliation_jobs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  idempotency_key text NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('provider','offline','cash','ledger','settlement')),
  scope_ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','quarantined','resolved','failed')),
  attempt_count bigint NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL,
  last_error_class text,
  correlation_id text,
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(organization_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_jobs_due
  ON operational_reconciliation_jobs(status,next_attempt_at);

CREATE TABLE IF NOT EXISTS operational_dr_states (
  service text PRIMARY KEY,
  state text NOT NULL CHECK (state IN ('healthy','degraded','failover_pending','failed_over','recovery_pending')),
  epoch bigint NOT NULL CHECK (epoch >= 0),
  changed_at timestamptz NOT NULL,
  correlation_id text,
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$')
);
