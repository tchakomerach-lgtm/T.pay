CREATE TABLE IF NOT EXISTS field_devices (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  device_id text NOT NULL CHECK (length(device_id) BETWEEN 16 AND 128),
  status text NOT NULL CHECK (status IN ('active','revoked')),
  max_offline_seconds integer NOT NULL CHECK (max_offline_seconds BETWEEN 60 AND 604800),
  last_accepted_sequence bigint NOT NULL DEFAULT 0 CHECK (last_accepted_sequence >= 0),
  created_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (organization_id, device_id),
  CHECK ((status = 'active' AND revoked_at IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS field_device_keys (
  organization_id uuid NOT NULL,
  device_id text NOT NULL,
  key_id text NOT NULL CHECK (length(key_id) BETWEEN 8 AND 128),
  public_key_pem text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','revoked')),
  created_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (organization_id, device_id, key_id),
  FOREIGN KEY (organization_id, device_id)
    REFERENCES field_devices(organization_id, device_id),
  CHECK ((status = 'active' AND revoked_at IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS field_offline_replay_claims (
  envelope_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  device_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence >= 1),
  claimed_at timestamptz NOT NULL,
  FOREIGN KEY (organization_id, device_id)
    REFERENCES field_devices(organization_id, device_id),
  UNIQUE (organization_id, device_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_field_offline_replay_claims_org_claimed
  ON field_offline_replay_claims (organization_id, claimed_at);
