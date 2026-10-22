-- L12.1: durable abuse controls and security incident evidence.
CREATE TABLE IF NOT EXISTS security_rate_limits (
  scope_key text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0),
  PRIMARY KEY (scope_key,window_started_at)
);
CREATE INDEX IF NOT EXISTS idx_security_rate_limits_window ON security_rate_limits(window_started_at);

CREATE TABLE IF NOT EXISTS security_incidents (
  id uuid PRIMARY KEY,
  organization_id uuid,
  actor_user_id uuid,
  category text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  evidence_hash text NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_incidents_org_created ON security_incidents(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_incidents_severity ON security_incidents(severity,created_at DESC);

CREATE OR REPLACE FUNCTION prevent_security_incident_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SECURITY_INCIDENT_APPEND_ONLY'; END;
$$;
DROP TRIGGER IF EXISTS trg_security_incident_append_only ON security_incidents;
CREATE TRIGGER trg_security_incident_append_only
BEFORE UPDATE OR DELETE ON security_incidents
FOR EACH ROW EXECUTE FUNCTION prevent_security_incident_mutation();
