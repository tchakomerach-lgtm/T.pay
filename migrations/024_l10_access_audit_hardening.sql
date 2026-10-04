-- L10.4: durable organization access throttling and append-only audit evidence.
CREATE TABLE IF NOT EXISTS organization_access_attempts (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  window_started_at timestamptz NOT NULL,
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  locked_until timestamptz,
  PRIMARY KEY (organization_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_access_attempts_lock ON organization_access_attempts(organization_id,locked_until);

CREATE OR REPLACE FUNCTION prevent_organization_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ORGANIZATION_AUDIT_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS trg_organization_audit_append_only ON organization_audit_events;
CREATE TRIGGER trg_organization_audit_append_only
BEFORE UPDATE OR DELETE ON organization_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_organization_audit_mutation();

ALTER TABLE organization_audit_events
  ADD CONSTRAINT organization_audit_events_metadata_object
  CHECK (jsonb_typeof(metadata) = 'object');

CREATE INDEX IF NOT EXISTS idx_org_audit_action
  ON organization_audit_events(organization_id,action,created_at DESC);
