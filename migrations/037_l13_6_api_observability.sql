-- L13.6 privacy-minimized operational API evidence. Never financial truth.
CREATE TABLE IF NOT EXISTS api_runtime_events (
  id uuid PRIMARY KEY,
  organization_id uuid,
  correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 8 AND 200),
  route text NOT NULL CHECK (length(route) BETWEEN 1 AND 240),
  method text NOT NULL CHECK (length(method) BETWEEN 3 AND 10),
  api_version text NOT NULL CHECK (api_version ~ '^v[0-9]+$'),
  channel text NOT NULL CHECK (channel IN ('web','mobile','agent','ussd','sms','voice','partner')),
  status_code integer NOT NULL CHECK (status_code BETWEEN 100 AND 599),
  outcome text NOT NULL CHECK (outcome IN ('success','client_error','server_error','limited','blocked','degraded')),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[A-Z][A-Z0-9_]{2,80}$'),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 0 AND 300000),
  dependency text CHECK (dependency IS NULL OR length(dependency) BETWEEN 1 AND 120),
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS api_runtime_events_time_idx ON api_runtime_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS api_runtime_events_correlation_idx ON api_runtime_events(correlation_id);
CREATE INDEX IF NOT EXISTS api_runtime_events_route_idx ON api_runtime_events(route,occurred_at DESC);
