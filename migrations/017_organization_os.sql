CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  organization_type text NOT NULL,
  owner_user_id uuid NOT NULL,
  access_code_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','suspended','archived')),
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS organization_roles (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  UNIQUE (organization_id, code),
  UNIQUE (organization_id, id)
);
CREATE TABLE IF NOT EXISTS organization_members (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('invited','active','suspended','removed')),
  joined_at timestamptz,
  PRIMARY KEY (organization_id,user_id),
  FOREIGN KEY (organization_id,role_id) REFERENCES organization_roles(organization_id,id)
);
CREATE TABLE IF NOT EXISTS organization_sessions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (organization_id,role_id) REFERENCES organization_roles(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_org_sessions_active ON organization_sessions(organization_id,user_id,expires_at) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS organization_surfaces (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id),
  public_page_enabled boolean NOT NULL DEFAULT true,
  website_enabled boolean NOT NULL DEFAULT true,
  internal_social_enabled boolean NOT NULL DEFAULT true,
  marketplace_enabled boolean NOT NULL DEFAULT true,
  recruitment_enabled boolean NOT NULL DEFAULT true,
  documents_enabled boolean NOT NULL DEFAULT true,
  wallet_enabled boolean NOT NULL DEFAULT true,
  communications_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL
);