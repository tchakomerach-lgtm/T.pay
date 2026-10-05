CREATE TABLE IF NOT EXISTS security_audit_events (
  sequence_id bigserial PRIMARY KEY,
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  actor_id text,
  agent_id text,
  correlation_id text,
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warn','high','critical')),
  event_timestamp timestamptz NOT NULL,
  payload_hash text NOT NULL,
  previous_hash text NOT NULL,
  record_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id),
  UNIQUE (record_hash)
);
CREATE INDEX IF NOT EXISTS security_audit_events_org_time_idx
  ON security_audit_events (organization_id, event_timestamp DESC);
