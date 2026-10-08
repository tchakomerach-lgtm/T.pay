CREATE TABLE IF NOT EXISTS fortress_user_data_objects (
 object_id TEXT NOT NULL,
 version BIGINT NOT NULL CHECK (version > 0),
 vault_id TEXT NOT NULL REFERENCES fortress_vaults(vault_id),
 organization_id TEXT,
 data_class TEXT NOT NULL CHECK (data_class IN ('public','internal','confidential','restricted','secret')),
 object_type TEXT NOT NULL,
 key_version TEXT NOT NULL,
 nonce BYTEA NOT NULL,
 ciphertext BYTEA NOT NULL,
 auth_tag BYTEA NOT NULL,
 aad_hash TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (object_id,version)
);

CREATE INDEX IF NOT EXISTS fortress_user_data_vault_current_idx
 ON fortress_user_data_objects(vault_id,object_id,version DESC);

CREATE INDEX IF NOT EXISTS fortress_user_data_tenant_idx
 ON fortress_user_data_objects(organization_id,vault_id);

ALTER TABLE fortress_user_data_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fortress_user_data_objects FROM PUBLIC;

DROP POLICY IF EXISTS fortress_user_data_select ON fortress_user_data_objects;
CREATE POLICY fortress_user_data_select ON fortress_user_data_objects
 FOR SELECT
 USING (
   EXISTS (
     SELECT 1 FROM fortress_vaults v
     WHERE v.vault_id=fortress_user_data_objects.vault_id
       AND (
         (v.vault_scope='tenant-user'
          AND v.organization_id=tpay_current_organization_id()
          AND v.owner_user_id=tpay_current_actor_id())
         OR
         (v.vault_scope='global-admin-user'
          AND current_user='tpay_fortress_operator'
          AND current_setting('tpay.fortress_global_access', true)='true'
          AND v.owner_user_id=tpay_current_actor_id())
       )
   )
 );

DROP POLICY IF EXISTS fortress_user_data_insert ON fortress_user_data_objects;
CREATE POLICY fortress_user_data_insert ON fortress_user_data_objects
 FOR INSERT
 WITH CHECK (
   organization_id = tpay_current_organization_id()
   AND EXISTS (
     SELECT 1 FROM fortress_vaults v
     WHERE v.vault_id=fortress_user_data_objects.vault_id
       AND v.vault_scope='tenant-user'
       AND v.organization_id=tpay_current_organization_id()
       AND v.owner_user_id=tpay_current_actor_id()
   )
 );

COMMENT ON TABLE fortress_user_data_objects IS
'Encrypted, versioned user data at the Fortress foundation. Plaintext is never persisted; each row belongs to one user-scoped module vault.';
COMMENT ON COLUMN fortress_user_data_objects.ciphertext IS
'Authenticated-encrypted payload. Application/database layers must never store plaintext here.';
COMMENT ON COLUMN fortress_user_data_objects.key_version IS
'External HSM/KMS key version reference used for this ciphertext. Enables controlled rotation without placing key material in PostgreSQL.';
