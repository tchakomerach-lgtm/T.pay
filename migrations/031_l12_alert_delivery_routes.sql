-- L12.4.1: durable alert delivery evidence reuses L12.3 incident routes.
CREATE TABLE IF NOT EXISTS operational_alert_deliveries (
  id uuid PRIMARY KEY,
  service text NOT NULL,
  alert_key text NOT NULL,
  route_id uuid NOT NULL REFERENCES incident_routes(route_id),
  delivery_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','sent','failed','suppressed')),
  attempted_at timestamptz NOT NULL,
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  UNIQUE(route_id, delivery_key)
);
CREATE INDEX IF NOT EXISTS idx_operational_alert_deliveries_alert
  ON operational_alert_deliveries(service, alert_key, attempted_at DESC);
