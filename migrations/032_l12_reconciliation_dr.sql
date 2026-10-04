-- L12.5: operational reconciliation and disaster-recovery evidence.
CREATE TABLE IF NOT EXISTS operational_reconciliation_runs (
  id uuid PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('ledger','provider','offline','cash','notifications','full')),
  status text NOT NULL CHECK (status IN ('started','succeeded','failed','quarantined')),
  correlation_id text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  mismatch_count bigint NOT NULL DEFAULT 0 CHECK (mismatch_count >= 0),
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$')
);
CREATE INDEX IF NOT EXISTS idx_operational_reconciliation_runs_scope
  ON operational_reconciliation_runs(scope, started_at DESC);

CREATE TABLE IF NOT EXISTS operational_reconciliation_exceptions (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES operational_reconciliation_runs(id),
  organization_id uuid,
  exception_key text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  state text NOT NULL CHECK (state IN ('open','quarantined','resolved')),
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  detected_at timestamptz NOT NULL,
  resolved_at timestamptz,
  UNIQUE(run_id, exception_key)
);

CREATE TABLE IF NOT EXISTS disaster_recovery_drills (
  id uuid PRIMARY KEY,
  environment text NOT NULL,
  scenario text NOT NULL CHECK (scenario IN ('restore','failover','provider_outage','region_loss')),
  status text NOT NULL CHECK (status IN ('planned','running','succeeded','failed','aborted')),
  rpo_target_seconds bigint NOT NULL CHECK (rpo_target_seconds >= 0),
  rto_target_seconds bigint NOT NULL CHECK (rto_target_seconds >= 0),
  observed_rpo_seconds bigint,
  observed_rto_seconds bigint,
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  started_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS operational_runbook_owners (
  runbook_key text PRIMARY KEY,
  owner_ref text NOT NULL,
  escalation_ref text NOT NULL,
  max_ack_seconds bigint NOT NULL CHECK (max_ack_seconds BETWEEN 60 AND 604800),
  low_bandwidth_channel text NOT NULL CHECK (low_bandwidth_channel IN ('sms','internal_queue','none')),
  active boolean NOT NULL DEFAULT true
);
