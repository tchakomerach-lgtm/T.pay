-- T.Pay Super Admin Control Plane
-- Durable state for privileged identities, JIT grants, root operations and recovery runs.
-- Secrets/private keys are intentionally NOT stored here.

CREATE TABLE IF NOT EXISTS tpay_privileged_identities (
  id uuid PRIMARY KEY,
  human_user_id text NOT NULL,
  privileged_level text NOT NULL CHECK (privileged_level IN ('L1_ROUTINE','L2_SENSITIVE','L3_CRITICAL','L4_SUPER_ADMIN','L5_ROOT_TRUST')),
  device_id text NOT NULL,
  assurance text NOT NULL CHECK (assurance IN ('FIDO2','HARDWARE_KEY','ATTESTED_WORKLOAD')),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tpay_privileged_grants (
  id uuid PRIMARY KEY,
  principal_id uuid NOT NULL REFERENCES tpay_privileged_identities(id),
  resource text NOT NULL,
  action text NOT NULL,
  justification text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  one_shot boolean NOT NULL DEFAULT false,
  approval_count integer NOT NULL DEFAULT 0 CHECK (approval_count >= 0),
  required_approvals integer NOT NULL CHECK (required_approvals > 0),
  consumed_at timestamptz,
  CHECK (expires_at > issued_at),
  CHECK (approval_count <= required_approvals)
);

CREATE INDEX IF NOT EXISTS idx_tpay_privileged_grants_active
  ON tpay_privileged_grants(principal_id, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS tpay_root_operations (
  id uuid PRIMARY KEY,
  operation text NOT NULL,
  actor_ids jsonb NOT NULL,
  independent_domains jsonb NOT NULL,
  request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('AUTHORIZED','EXECUTED','REVOKED','EXPIRED'))
);

CREATE INDEX IF NOT EXISTS idx_tpay_root_operations_digest
  ON tpay_root_operations(request_digest);

CREATE TABLE IF NOT EXISTS tpay_recovery_runs (
  id uuid PRIMARY KEY,
  incident_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('UNKNOWN','COMPROMISED','ISOLATED','FORENSIC','REBUILDING','VERIFICATION','PARTIALLY_TRUSTED','TRUSTED','MONITORED')),
  started_at timestamptz NOT NULL,
  last_transition_at timestamptz NOT NULL,
  evidence_digest char(64) NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_tpay_recovery_runs_incident
  ON tpay_recovery_runs(incident_id, last_transition_at DESC);

CREATE TABLE IF NOT EXISTS tpay_recovery_approvals (
  recovery_run_id uuid NOT NULL REFERENCES tpay_recovery_runs(id),
  approver_id uuid NOT NULL REFERENCES tpay_privileged_identities(id),
  approval_digest char(64) NOT NULL CHECK (approval_digest ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recovery_run_id, approver_id)
);
