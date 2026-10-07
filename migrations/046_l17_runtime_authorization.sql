-- L17 runtime authorization: persist organization-scoped actor permissions.
CREATE TABLE IF NOT EXISTS api_actor_permissions (
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  actor_id uuid NOT NULL,
  permission text NOT NULL CHECK (permission IN (
    'org.read','org.manage','member.manage','finance.read','finance.initiate',
    'finance.approve','ledger.read','ledger.post','audit.read','security.manage'
  )),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, organization_id, actor_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_api_actor_permissions_lookup
  ON api_actor_permissions(tenant_id, organization_id, actor_id);

ALTER TABLE api_actor_permissions ENABLE ROW LEVEL SECURITY;
