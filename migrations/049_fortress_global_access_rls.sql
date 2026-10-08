DROP POLICY IF EXISTS fortress_vaults_tenant_policy ON fortress_vaults;
CREATE POLICY fortress_vaults_tenant_policy ON fortress_vaults
 USING (
   (organization_id IS NOT NULL AND organization_id = tpay_current_organization_id())
   OR (organization_id IS NULL AND current_setting('tpay.fortress_global_access', true) = 'true')
 )
 WITH CHECK (
   (organization_id IS NOT NULL AND organization_id = tpay_current_organization_id())
   OR (organization_id IS NULL AND current_setting('tpay.fortress_global_access', true) = 'true')
 );

DROP POLICY IF EXISTS fortress_bridges_tenant_policy ON fortress_bridge_policies;
CREATE POLICY fortress_bridges_tenant_policy ON fortress_bridge_policies
 USING (
   EXISTS (
     SELECT 1 FROM fortress_vaults s
     WHERE s.vault_id = source_vault_id
       AND (
         (s.organization_id IS NOT NULL AND s.organization_id = tpay_current_organization_id())
         OR (s.organization_id IS NULL AND current_setting('tpay.fortress_global_access', true) = 'true')
       )
   )
 )
 WITH CHECK (
   EXISTS (
     SELECT 1 FROM fortress_vaults s
     WHERE s.vault_id = source_vault_id
       AND (
         (s.organization_id IS NOT NULL AND s.organization_id = tpay_current_organization_id())
         OR (s.organization_id IS NULL AND current_setting('tpay.fortress_global_access', true) = 'true')
       )
   )
 );

ALTER TABLE fortress_vaults DROP CONSTRAINT IF EXISTS fortress_global_vault_identity_check;
ALTER TABLE fortress_vaults ADD CONSTRAINT fortress_global_vault_identity_check
 CHECK (
   (organization_id IS NOT NULL AND vault_type IN ('primary','sub'))
   OR (organization_id IS NULL AND vault_type IN ('root','general','super-admin'))
 );

ALTER TABLE fortress_vaults DROP CONSTRAINT IF EXISTS fortress_general_parent_check;
ALTER TABLE fortress_vaults ADD CONSTRAINT fortress_general_parent_check
 CHECK (
   (vault_type='root' AND parent_vault_id IS NULL)
   OR (vault_type='general' AND parent_vault_id='root-trust')
   OR (vault_type='super-admin' AND parent_vault_id='general-fortress')
   OR (vault_type='primary' AND parent_vault_id='general-fortress')
   OR (vault_type='sub' AND parent_vault_id IS NOT NULL)
 );
