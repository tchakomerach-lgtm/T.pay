ALTER TABLE fortress_vaults DROP CONSTRAINT IF EXISTS fortress_vault_type_check;
ALTER TABLE fortress_vaults ADD CONSTRAINT fortress_vault_type_check
 CHECK (vault_type IN ('root','general','administrator','primary','sub'));

ALTER TABLE fortress_vaults DROP CONSTRAINT IF EXISTS fortress_root_parent_check;
ALTER TABLE fortress_vaults ADD CONSTRAINT fortress_root_parent_check
 CHECK (
   (vault_type='root' AND parent_vault_id IS NULL)
   OR (vault_type='general' AND parent_vault_id='root-trust')
   OR (vault_type='administrator' AND parent_vault_id='general-fortress')
   OR (vault_type='primary' AND parent_vault_id='general-fortress')
   OR (vault_type='sub' AND parent_vault_id IS NOT NULL)
 );

DROP POLICY IF EXISTS fortress_vaults_tenant_policy ON fortress_vaults;
DROP POLICY IF EXISTS fortress_vaults_user_scope_policy ON fortress_vaults;

CREATE POLICY fortress_vaults_user_isolation ON fortress_vaults
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

COMMENT ON POLICY fortress_vaults_user_isolation ON fortress_vaults IS
'System vaults are tenant/global scoped; user vaults are owner scoped. No permissive tenant policy may coexist because PostgreSQL combines permissive policies with OR.';
