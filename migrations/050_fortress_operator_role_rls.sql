DROP POLICY IF EXISTS fortress_vaults_tenant_policy ON fortress_vaults;
CREATE POLICY fortress_vaults_tenant_policy ON fortress_vaults
 USING (
   (organization_id IS NOT NULL AND organization_id = tpay_current_organization_id())
   OR (organization_id IS NULL AND current_user = 'tpay_fortress_operator' AND current_setting('tpay.fortress_global_access', true) = 'true')
 )
 WITH CHECK (
   (organization_id IS NOT NULL AND organization_id = tpay_current_organization_id())
   OR (organization_id IS NULL AND current_user = 'tpay_fortress_operator' AND current_setting('tpay.fortress_global_access', true) = 'true')
 );

DROP POLICY IF EXISTS fortress_bridges_tenant_policy ON fortress_bridge_policies;
CREATE POLICY fortress_bridges_tenant_policy ON fortress_bridge_policies
 USING (
   EXISTS (
     SELECT 1 FROM fortress_vaults s
     WHERE s.vault_id = source_vault_id
       AND (
         (s.organization_id IS NOT NULL AND s.organization_id = tpay_current_organization_id())
         OR (s.organization_id IS NULL AND current_user = 'tpay_fortress_operator' AND current_setting('tpay.fortress_global_access', true) = 'true')
       )
   )
 )
 WITH CHECK (
   EXISTS (
     SELECT 1 FROM fortress_vaults s
     WHERE s.vault_id = source_vault_id
       AND (
         (s.organization_id IS NOT NULL AND s.organization_id = tpay_current_organization_id())
         OR (s.organization_id IS NULL AND current_user = 'tpay_fortress_operator' AND current_setting('tpay.fortress_global_access', true) = 'true')
       )
   )
 );