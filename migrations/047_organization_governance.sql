CREATE TABLE IF NOT EXISTS organization_audit_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_audit_events_org_created_idx
  ON organization_audit_events(organization_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by_user_id uuid NOT NULL REFERENCES users(id),
  login_identifier text NOT NULL,
  role_id uuid NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','revoked')),
  expires_at timestamptz NOT NULL,
  accepted_by_user_id uuid REFERENCES users(id),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, role_id)
    REFERENCES organization_roles(organization_id, id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS organization_invitations_org_idx
  ON organization_invitations(organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_portal_codes (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash char(64) NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS organization_portal_codes_lookup_idx
  ON organization_portal_codes(organization_id, user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS organization_memberships_role_idx
  ON organization_memberships(organization_id, role_id, status);