-- L12.4: durable operational metrics, SLO windows and alert evidence.
CREATE TABLE IF NOT EXISTS operational_measurements (
  id uuid PRIMARY KEY,
  service text NOT NULL,
  metric text NOT NULL,
  value bigint NOT NULL,
  observed_at timestamptz NOT NULL,
  correlation_id text,
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$')
);
CREATE INDEX IF NOT EXISTS idx_operational_measurements_lookup ON operational_measurements(service,metric,observed_at DESC);

CREATE TABLE IF NOT EXISTS operational_alerts (
  id uuid PRIMARY KEY,
  service text NOT NULL,
  alert_key text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  state text NOT NULL CHECK (state IN ('open','acknowledged','resolved')),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  correlation_id text,
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  UNIQUE(service,alert_key)
);

CREATE TABLE IF NOT EXISTS operational_slo_policies (
  service text NOT NULL,
  metric text NOT NULL,
  target_bps bigint NOT NULL CHECK (target_bps BETWEEN 0 AND 10000),
  window_seconds bigint NOT NULL CHECK (window_seconds BETWEEN 60 AND 2592000),
  critical_breach_bps bigint NOT NULL CHECK (critical_breach_bps BETWEEN 0 AND 10000),
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY(service,metric)
);
