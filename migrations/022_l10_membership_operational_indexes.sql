-- L10.3: operational indexes for organization membership and role resolution.
CREATE INDEX IF NOT EXISTS idx_org_members_status
  ON organization_members(organization_id,status,user_id);

CREATE INDEX IF NOT EXISTS idx_org_members_role
  ON organization_members(organization_id,role_id,user_id);

CREATE INDEX IF NOT EXISTS idx_org_roles_code
  ON organization_roles(organization_id,code);
