CREATE TABLE IF NOT EXISTS tpay_jit_approvals(
  grant_id uuid NOT NULL REFERENCES tpay_privileged_grants(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES tpay_privileged_identities(id),
  approval_digest char(64) NOT NULL CHECK(approval_digest ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(grant_id,approver_id)
);
CREATE TABLE IF NOT EXISTS tpay_privileged_sessions(
  id uuid PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES tpay_privileged_grants(id),
  principal_id uuid NOT NULL REFERENCES tpay_privileged_identities(id),
  resource text NOT NULL,
  action text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  terminated_at timestamptz,
  command_count integer NOT NULL DEFAULT 0 CHECK(command_count>=0),
  UNIQUE(grant_id,principal_id)
);
CREATE TABLE IF NOT EXISTS tpay_root_approvals(
  operation_id uuid NOT NULL REFERENCES tpay_root_operations(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES tpay_privileged_identities(id),
  independent_domain text NOT NULL,
  signature_format text NOT NULL CHECK(signature_format IN ('ECDSA_P256_SHA256','ED25519')),
  signature bytea NOT NULL,
  signed_digest char(64) NOT NULL CHECK(signed_digest ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(operation_id,actor_id),
  UNIQUE(operation_id,independent_domain)
);
CREATE TABLE IF NOT EXISTS tpay_recovery_transitions(
  id uuid PRIMARY KEY,
  recovery_run_id uuid NOT NULL REFERENCES tpay_recovery_runs(id) ON DELETE CASCADE,
  from_state text NOT NULL,
  to_state text NOT NULL,
  actor_id uuid,
  evidence_digest char(64) NOT NULL CHECK(evidence_digest ~ '^[0-9a-f]{64}$'),
  transition_key char(64) NOT NULL CHECK(transition_key ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recovery_run_id,transition_key)
);
CREATE TABLE IF NOT EXISTS tpay_recovery_checkpoints(
  id uuid PRIMARY KEY,
  recovery_run_id uuid NOT NULL REFERENCES tpay_recovery_runs(id),
  plane text NOT NULL CHECK(plane IN ('TRUST','IDENTITY','SECURITY','LEDGER','PAYMENT','WALLET','CORE_API','ORG_DATA','MEDIA')),
  source_generation text NOT NULL,
  digest char(64) NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  UNIQUE(recovery_run_id,plane,source_generation)
);
CREATE TABLE IF NOT EXISTS tpay_recovery_backup_manifests(
  id uuid PRIMARY KEY,
  recovery_run_id uuid NOT NULL REFERENCES tpay_recovery_runs(id),
  storage_class text NOT NULL CHECK(storage_class IN ('IMMUTABLE','WORM','OFFLINE')),
  location_ref text NOT NULL,
  manifest_digest char(64) NOT NULL CHECK(manifest_digest ~ '^[0-9a-f]{64}$'),
  encrypted boolean NOT NULL,
  restore_tested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);