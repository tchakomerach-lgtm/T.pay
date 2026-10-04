-- L11.2: organization-scoped AI tool sandbox policy.
CREATE TABLE IF NOT EXISTS ai_tool_policies (
  organization_id uuid NOT NULL,
  tool_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  allowed_agent_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_risk text NOT NULL CHECK (max_risk IN ('low','medium','high','critical')),
  requires_human_approval boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id,tool_name)
);
CREATE INDEX IF NOT EXISTS idx_ai_tool_policies_enabled
  ON ai_tool_policies(organization_id,enabled,tool_name);
