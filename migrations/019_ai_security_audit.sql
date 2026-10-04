CREATE TABLE IF NOT EXISTS ai_security_events (
  id uuid PRIMARY KEY,
  organization_id uuid,
  user_id uuid NOT NULL,
  ai_run_id uuid REFERENCES ai_runs(id),
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  evidence_hash text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_security_events_org_created ON ai_security_events(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS organization_audit_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_org_audit_org_created ON organization_audit_events(organization_id,created_at DESC);