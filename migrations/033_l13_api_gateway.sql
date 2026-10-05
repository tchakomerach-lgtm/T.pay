-- L13 API Gateway request governance: durable idempotency and request audit.
CREATE TABLE IF NOT EXISTS api_request_deduplication (
  id uuid PRIMARY KEY,
  organization_id uuid,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  route text NOT NULL,
  state text NOT NULL CHECK (state IN ('reserved','succeeded','failed')),
  response_hash text,
  status_code integer CHECK (status_code BETWEEN 100 AND 599),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE(organization_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_api_dedupe_expiry ON api_request_deduplication(expires_at);
CREATE TABLE IF NOT EXISTS api_request_audit (
  id uuid PRIMARY KEY,
  organization_id uuid,
  request_id text NOT NULL,
  route text NOT NULL,
  actor_id uuid,
  auth_class text NOT NULL CHECK (auth_class IN ('anonymous','user','member','admin','service')),
  outcome text NOT NULL CHECK (outcome IN ('accepted','rejected','rate_limited','failed')),
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  metadata_hash text NOT NULL CHECK (metadata_hash ~ '^[a-f0-9]{64}$')
);
CREATE INDEX IF NOT EXISTS idx_api_audit_correlation ON api_request_audit(correlation_id);

-- PostgreSQL NULL semantics would otherwise allow duplicate anonymous idempotency keys.
CREATE UNIQUE INDEX IF NOT EXISTS ux_api_dedupe_org_key ON api_request_deduplication(organization_id,idempotency_key) WHERE organization_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_api_dedupe_anonymous_key ON api_request_deduplication(idempotency_key) WHERE organization_id IS NULL;
