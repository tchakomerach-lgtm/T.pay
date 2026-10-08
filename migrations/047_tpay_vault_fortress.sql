-- T.Pay Vault Fortress foundation.
-- Keys are metadata only: plaintext key material MUST remain in an external KMS/HSM.
CREATE TABLE IF NOT EXISTS tpay_vaults (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text,
  parent_vault_id uuid REFERENCES tpay_vaults(id) ON DELETE RESTRICT,
  owner_actor_id uuid,
  vault_class text NOT NULL CHECK (vault_class IN (
    'general','administrator','finance','identity','ai','organization',
    'data_rag','document','social','offline_field','audit_evidence','user_module'
  )),
  module_code text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','sealed','suspended','destroyed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sealed_at timestamptz,
  UNIQUE (tenant_id,id),
  CHECK (parent_vault_id IS NULL OR parent_vault_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_tpay_vaults_scope ON tpay_vaults(tenant_id,organization_id,vault_class);
CREATE INDEX IF NOT EXISTS idx_tpay_vaults_owner ON tpay_vaults(tenant_id,owner_actor_id);

CREATE TABLE IF NOT EXISTS tpay_vault_keys (
  vault_id uuid NOT NULL REFERENCES tpay_vaults(id) ON DELETE RESTRICT,
  key_version integer NOT NULL CHECK (key_version > 0),
  kms_key_ref text NOT NULL,
  algorithm text NOT NULL CHECK (algorithm IN ('AES-256-GCM')),
  status text NOT NULL CHECK (status IN ('active','retired','destroyed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  PRIMARY KEY (vault_id,key_version),
  UNIQUE (vault_id,kms_key_ref)
);

CREATE TABLE IF NOT EXISTS tpay_vault_objects (
  id uuid PRIMARY KEY,
  vault_id uuid NOT NULL REFERENCES tpay_vaults(id) ON DELETE RESTRICT,
  object_type text NOT NULL,
  object_version bigint NOT NULL CHECK (object_version > 0),
  key_version integer NOT NULL,
  nonce bytea NOT NULL CHECK (octet_length(nonce)=12),
  ciphertext bytea NOT NULL,
  auth_tag bytea NOT NULL CHECK (octet_length(auth_tag)=16),
  aad_sha256 bytea NOT NULL CHECK (octet_length(aad_sha256)=32),
  payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256)=32),
  created_at timestamptz NOT NULL DEFAULT now(),
  destroyed_at timestamptz,
  UNIQUE (vault_id,id,object_version),
  FOREIGN KEY (vault_id,key_version) REFERENCES tpay_vault_keys(vault_id,key_version)
);

CREATE INDEX IF NOT EXISTS idx_tpay_vault_objects_lookup ON tpay_vault_objects(vault_id,object_type,created_at DESC);

CREATE TABLE IF NOT EXISTS tpay_vault_access_grants (
  id uuid PRIMARY KEY,
  vault_id uuid NOT NULL REFERENCES tpay_vaults(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  permission text NOT NULL CHECK (permission IN ('read','write','seal','manage_access','destroy')),
  granted_by uuid NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_tpay_vault_access_active
  ON tpay_vault_access_grants(vault_id,actor_id,permission)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS tpay_vault_audit (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  vault_id uuid NOT NULL REFERENCES tpay_vaults(id) ON DELETE RESTRICT,
  actor_id uuid,
  action text NOT NULL CHECK (action IN ('create','open','read','write','seal','grant','revoke','destroy','key_rotate','deny')),
  object_id uuid,
  key_version integer,
  correlation_id text,
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tpay_vault_audit_scope ON tpay_vault_audit(tenant_id,vault_id,created_at DESC);

ALTER TABLE tpay_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE tpay_vault_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE tpay_vault_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tpay_vault_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tpay_vault_audit ENABLE ROW LEVEL SECURITY;

ALTER TABLE tpay_vaults FORCE ROW LEVEL SECURITY;
ALTER TABLE tpay_vault_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE tpay_vault_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE tpay_vault_access_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE tpay_vault_audit FORCE ROW LEVEL SECURITY;

CREATE POLICY tpay_vaults_explicit_scope ON tpay_vaults
  USING (tenant_id = current_setting('tpay.tenant_id', true) AND current_setting('tpay.vault_id', true) = id::text)
  WITH CHECK (tenant_id = current_setting('tpay.tenant_id', true));

CREATE POLICY tpay_vault_keys_explicit_scope ON tpay_vault_keys
  USING (EXISTS (
    SELECT 1 FROM tpay_vaults v
    WHERE v.id=vault_id AND v.tenant_id=current_setting('tpay.tenant_id', true)
      AND current_setting('tpay.vault_id', true)=v.id::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tpay_vaults v
    WHERE v.id=vault_id AND v.tenant_id=current_setting('tpay.tenant_id', true)
      AND current_setting('tpay.vault_id', true)=v.id::text
  ));

CREATE POLICY tpay_vault_objects_explicit_scope ON tpay_vault_objects
  USING (EXISTS (
    SELECT 1 FROM tpay_vaults v
    WHERE v.id=vault_id AND v.tenant_id=current_setting('tpay.tenant_id', true)
      AND current_setting('tpay.vault_id', true)=v.id::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tpay_vaults v
    WHERE v.id=vault_id AND v.tenant_id=current_setting('tpay.tenant_id', true)
      AND current_setting('tpay.vault_id', true)=v.id::text
  ));

CREATE POLICY tpay_vault_access_explicit_scope ON tpay_vault_access_grants
  USING (EXISTS (
    SELECT 1 FROM tpay_vaults v
    WHERE v.id=vault_id AND v.tenant_id=current_setting('tpay.tenant_id', true)
      AND current_setting('tpay.vault_id', true)=v.id::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tpay_vaults v
    WHERE v.id=vault_id AND v.tenant_id=current_setting('tpay.tenant_id', true)
      AND current_setting('tpay.vault_id', true)=v.id::text
  ));

CREATE POLICY tpay_vault_audit_explicit_scope ON tpay_vault_audit
  USING (tenant_id=current_setting('tpay.tenant_id', true) AND current_setting('tpay.vault_id', true)=vault_id::text)
  WITH CHECK (tenant_id=current_setting('tpay.tenant_id', true) AND current_setting('tpay.vault_id', true)=vault_id::text);
