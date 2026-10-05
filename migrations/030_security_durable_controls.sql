CREATE TABLE IF NOT EXISTS security_replay_claims (
  tenant_id text NOT NULL,
  jti text NOT NULL,
  request_digest char(64) NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  source text NOT NULL CHECK (source IN ('user','agent','system')),
  first_seen_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, jti),
  CHECK (expires_at > first_seen_at)
);

CREATE INDEX IF NOT EXISTS idx_security_replay_claims_expiry
  ON security_replay_claims (expires_at);

CREATE TABLE IF NOT EXISTS security_approvals (
  approval_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  approver_id text NOT NULL,
  request_digest char(64) NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('pending','consumed','revoked')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK ((status = 'consumed' AND consumed_at IS NOT NULL) OR status <> 'consumed')
);

CREATE INDEX IF NOT EXISTS idx_security_approvals_lookup
  ON security_approvals (tenant_id, approval_id, status);

CREATE TABLE IF NOT EXISTS security_event_heads (
  tenant_id text PRIMARY KEY,
  last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  last_hash char(64)
);

CREATE TABLE IF NOT EXISTS security_events (
  event_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  request_id text NOT NULL,
  actor_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  decision text NOT NULL CHECK (decision IN ('ALLOW','DENY','REQUIRE_HUMAN_APPROVAL')),
  reason_code text NOT NULL,
  policy_version text NOT NULL,
  policy_revision text NOT NULL,
  request_digest char(64) NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  decision_source text NOT NULL CHECK (decision_source IN ('runtime-policy','human-approval','emergency-policy')),
  rule_ids jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash char(64),
  event_hash char(64) NOT NULL CHECK (event_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sequence),
  UNIQUE (tenant_id, event_hash)
);

CREATE INDEX IF NOT EXISTS idx_security_events_tenant_time
  ON security_events (tenant_id, occurred_at);
