CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  login_identifier text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity_credentials (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('password','passkey','recovery')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','locked')),
  secret_hash text,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, kind)
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  founder_id uuid NOT NULL REFERENCES users(id),
  access_code_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_roles (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  UNIQUE(organization_id, id),
  UNIQUE(organization_id, name)
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id),
  FOREIGN KEY (organization_id, role_id)
    REFERENCES organization_roles(organization_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS identity_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid,
  token_hash char(64) NOT NULL UNIQUE,
  csrf_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  rotated_from_id uuid REFERENCES identity_sessions(id),
  assurance text NOT NULL DEFAULT 'standard' CHECK (assurance IN ('standard','step_up')),
  user_agent text,
  ip_hash char(64),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS identity_sessions_user_idx
  ON identity_sessions(user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS identity_sessions_expiry_idx
  ON identity_sessions(expires_at);

CREATE INDEX IF NOT EXISTS organization_memberships_user_idx
  ON organization_memberships(user_id, status);
