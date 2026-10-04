-- L10.5: idempotent organization provisioning and tenant-safe lifecycle evidence.
CREATE TABLE IF NOT EXISTS organization_provisioning_keys (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_org_provisioning_created ON organization_provisioning_keys(created_at);
