ALTER TABLE fortress_vaults
 ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
 ADD COLUMN IF NOT EXISTS vault_scope TEXT NOT NULL DEFAULT 'system';

ALTER TABLE fortress_vaults DROP CONSTRAINT IF EXISTS fortress_vault_scope_check;
ALTER TABLE fortress_vaults ADD CONSTRAINT fortress_vault_scope_check
 CHECK (vault_scope IN ('system','tenant-user','global-admin-user'));

ALTER TABLE fortress_vaults DROP CONSTRAINT IF EXISTS fortress_user_owner_check;
ALTER TABLE fortress_vaults ADD CONSTRAINT fortress_user_owner_check
 CHECK (
   (vault_scope='system' AND owner_user_id IS NULL)
   OR (vault_scope IN ('tenant-user','global-admin-user') AND owner_user_id IS NOT NULL)
 );

ALTER TABLE fortress_vaults DROP CONSTRAINT IF EXISTS fortress_user_parent_check;
ALTER TABLE fortress_vaults ADD CONSTRAINT fortress_user_parent_check
 CHECK (
   (vault_scope='system')
   OR (vault_scope='tenant-user' AND organization_id IS NOT NULL)
   OR (vault_scope='global-admin-user' AND organization_id IS NULL)
 );

CREATE UNIQUE INDEX IF NOT EXISTS fortress_user_vault_identity_idx
 ON fortress_vaults(parent_vault_id,organization_id,owner_user_id)
 WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fortress_user_vault_owner_idx
 ON fortress_vaults(organization_id,owner_user_id)
 WHERE owner_user_id IS NOT NULL;

DROP POLICY IF EXISTS fortress_vaults_user_scope_policy ON fortress_vaults;
CREATE POLICY fortress_vaults_user_scope_policy ON fortress_vaults
 USING (
   (vault_scope='system' AND (
      (organization_id IS NOT NULL AND organization_id = tpay_current_organization_id())
      OR (organization_id IS NULL AND current_user='tpay_fortress_operator' AND current_setting('tpay.fortress_global_access', true)='true')
   ))
   OR (vault_scope='tenant-user'
       AND organization_id=tpay_current_organization_id()
       AND owner_user_id=tpay_current_actor_id())
   OR (vault_scope='global-admin-user'
       AND current_user='tpay_fortress_operator'
       AND current_setting('tpay.fortress_global_access', true)='true'
       AND owner_user_id=tpay_current_actor_id())
 )
 WITH CHECK (
   (vault_scope='system' AND (
      (organization_id IS NOT NULL AND organization_id = tpay_current_organization_id())
      OR (organization_id IS NULL AND current_user='tpay_fortress_operator' AND current_setting('tpay.fortress_global_access', true)='true')
   ))
   OR (vault_scope='tenant-user'
       AND organization_id=tpay_current_organization_id()
       AND owner_user_id=tpay_current_actor_id())
   OR (vault_scope='global-admin-user'
       AND current_user='tpay_fortress_operator'
       AND current_setting('tpay.fortress_global_access', true)='true'
       AND owner_user_id=tpay_current_actor_id())
 );

COMMENT ON COLUMN fortress_vaults.owner_user_id IS 'Verified T.Pay user owner for user-scoped Fortress vaults; never treated as authentication proof by itself.';
COMMENT ON COLUMN fortress_vaults.vault_scope IS 'system, tenant-user or global-admin-user. User-scoped vaults are cryptographically independent per module/user.';
