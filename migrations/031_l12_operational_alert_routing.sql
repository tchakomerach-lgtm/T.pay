-- L12.4: durable routing state for operational alerts and degraded-mode escalation.
CREATE TABLE IF NOT EXISTS operational_alert_deliveries (
  id uuid PRIMARY KEY,
  service text NOT NULL,
  alert_key text NOT NULL,
  route_id uuid NOT NULL REFERENCES incident_routes(route_id),
  delivery_key text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','webhook','pager','internal_queue')),
  status text NOT NULL CHECK (status IN ('queued','sent','failed','suppressed')),
  attempted_at timestamptz NOT NULL,
  correlation_id text,
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  UNIQUE(route_id, delivery_key)
);
CREATE INDEX IF NOT EXISTS idx_operational_alert_deliveries_lookup
  ON operational_alert_deliveries(service,alert_key,attempted_at DESC);

CREATE TABLE IF NOT EXISTS operational_degraded_drills (
  id uuid PRIMARY KEY,
  service text NOT NULL,
  dependency text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('healthy','degraded','offline','recovered')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  correlation_id text NOT NULL,
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$')
);
CREATE INDEX IF NOT EXISTS idx_operational_degraded_drills_lookup
  ON operational_degraded_drills(service,dependency,started_at DESC);

-- Dashboard contract: operational telemetry is the source of measurement truth.
-- Metric names are stable contracts emitted by production adapters.
CREATE OR REPLACE VIEW operational_dashboard_latest AS
SELECT DISTINCT ON (service, metric)
  service, metric, value, observed_at, correlation_id, evidence_hash
FROM operational_measurements
ORDER BY service, metric, observed_at DESC;

CREATE OR REPLACE VIEW operational_dashboard_alerts AS
SELECT service, alert_key, severity, state, first_seen_at, last_seen_at, correlation_id, evidence_hash
FROM operational_alerts
WHERE state <> 'resolved';

CREATE OR REPLACE VIEW operational_dashboard_degraded_dependencies AS
SELECT DISTINCT ON (service, dependency)
  service, dependency, mode, started_at, ended_at, correlation_id, evidence_hash
FROM operational_degraded_drills
ORDER BY service, dependency, started_at DESC;
