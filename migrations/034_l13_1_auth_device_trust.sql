-- L13.1 authentication/device trust: tenant-safe device binding and revocable sessions.
CREATE TABLE IF NOT EXISTS api_devices (
  id uuid PRIMARY KEY,
  organization_id uuid,
  actor_id uuid NOT NULL,
  device_key_hash text NOT NULL CHECK (device_key_hash ~ '^[a-f0-9]{64}$'),
  device_label text NOT NULL,
  shared_device boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('active','locked','revoked')),
  trust_epoch bigint NOT NULL DEFAULT 1 CHECK (trust_epoch > 0),
  failed_auth_count integer NOT NULL DEFAULT 0 CHECK (failed_auth_count >= 0),
  locked_until timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_api_devices_tenant_key ON api_devices(organization_id,device_key_hash) WHERE organization_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_api_devices_anonymous_key ON api_devices(device_key_hash) WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_devices_actor ON api_devices(organization_id,actor_id,status);

CREATE TABLE IF NOT EXISTS api_sessions (
  id uuid PRIMARY KEY,
  organization_id uuid,
  actor_id uuid NOT NULL,
  device_id uuid NOT NULL,
  session_hash text NOT NULL CHECK (session_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('active','revoked','expired')),
  trust_epoch bigint NOT NULL CHECK (trust_epoch > 0),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_api_sessions_hash ON api_sessions(session_hash);
CREATE INDEX IF NOT EXISTS idx_api_sessions_expiry ON api_sessions(expires_at,status);
CREATE INDEX IF NOT EXISTS idx_api_sessions_device ON api_sessions(device_id,status);
