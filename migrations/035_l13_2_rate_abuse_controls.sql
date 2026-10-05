-- L13.2 API abuse controls: atomic fixed-window buckets.
-- Scope identifiers are hashes; raw IP/phone/device identifiers are never persisted here.
CREATE TABLE IF NOT EXISTS api_rate_limit_buckets (
  policy_key text NOT NULL,
  scope_hash text NOT NULL CHECK (scope_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count bigint NOT NULL CHECK (request_count >= 0),
  max_requests bigint NOT NULL CHECK (max_requests > 0),
  window_seconds integer NOT NULL CHECK (window_seconds BETWEEN 1 AND 86400),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(policy_key,scope_hash)
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limit_updated
  ON api_rate_limit_buckets(updated_at);

CREATE TABLE IF NOT EXISTS api_abuse_events (
  id uuid PRIMARY KEY,
  organization_id uuid,
  route text NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('ip','device','actor','organization','phone','channel')),
  scope_hash text NOT NULL CHECK (scope_hash ~ '^[a-f0-9]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('allowed','limited','blocked')),
  reason text NOT NULL,
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$')
);
CREATE INDEX IF NOT EXISTS idx_api_abuse_events_time
  ON api_abuse_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_abuse_events_scope
  ON api_abuse_events(scope_type,scope_hash,occurred_at DESC);
