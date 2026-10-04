CREATE TABLE IF NOT EXISTS ai_agents (
  id uuid PRIMARY KEY,
  organization_id uuid,
  code text NOT NULL,
  role text NOT NULL,
  policy_version text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_tool_registry (
  name text PRIMARY KEY,
  risk text NOT NULL CHECK (risk IN ('low','medium','high','critical')),
  requires_human_approval boolean NOT NULL,
  allowed_agent_roles jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE IF NOT EXISTS ai_runs (
  id uuid PRIMARY KEY,
  organization_id uuid,
  user_id uuid NOT NULL,
  agent_id uuid REFERENCES ai_agents(id),
  model_provider text NOT NULL,
  model_name text NOT NULL,
  policy_version text NOT NULL,
  action text NOT NULL,
  risk text NOT NULL,
  input_hash text NOT NULL,
  output_hash text,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_org_created ON ai_runs(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS ai_approval_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  ai_run_id uuid NOT NULL REFERENCES ai_runs(id),
  requested_action text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected','expired')),
  reviewer_user_id uuid,
  decided_at timestamptz
);