-- L12.3: operational secret rotation evidence, deployment serialization and incident routing.
CREATE TABLE IF NOT EXISTS secret_rotation_events (
  id uuid PRIMARY KEY,
  secret_ref text NOT NULL,
  version text NOT NULL,
  material_digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('started','succeeded','failed','rolled_back')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  evidence_hash text NOT NULL,
  UNIQUE(secret_ref, version)
);
CREATE INDEX IF NOT EXISTS idx_secret_rotation_events_ref ON secret_rotation_events(secret_ref, started_at DESC);
CREATE TABLE IF NOT EXISTS deployment_locks (
  lock_name text PRIMARY KEY,
  owner_id text NOT NULL,
  lease_until timestamptz NOT NULL,
  acquired_at timestamptz NOT NULL,
  CHECK (lease_until > acquired_at)
);
CREATE TABLE IF NOT EXISTS incident_routes (
  route_id uuid PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('email','sms','webhook','pager','internal_queue')),
  destination_ref text NOT NULL,
  minimum_severity text NOT NULL CHECK (minimum_severity IN ('low','medium','high','critical')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  UNIQUE(channel, destination_ref)
);
CREATE TABLE IF NOT EXISTS incident_delivery_evidence (
  id uuid PRIMARY KEY,
  route_id uuid NOT NULL REFERENCES incident_routes(route_id),
  incident_id uuid NOT NULL,
  delivery_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','sent','failed','suppressed')),
  attempted_at timestamptz NOT NULL,
  evidence_hash text NOT NULL,
  UNIQUE(route_id, delivery_key)
);
CREATE INDEX IF NOT EXISTS idx_incident_delivery_incident ON incident_delivery_evidence(incident_id, attempted_at DESC);

ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text;
ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS applied_by text;
