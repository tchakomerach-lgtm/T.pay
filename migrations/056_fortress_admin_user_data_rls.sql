DROP POLICY IF EXISTS fortress_user_data_insert ON fortress_user_data_objects;
CREATE POLICY fortress_user_data_insert ON fortress_user_data_objects
 FOR INSERT
 WITH CHECK (
   (
     organization_id = tpay_current_organization_id()
     AND EXISTS (
       SELECT 1 FROM fortress_vaults v
       WHERE v.vault_id=fortress_user_data_objects.vault_id
         AND v.vault_scope='tenant-user'
         AND v.organization_id=tpay_current_organization_id()
         AND v.owner_user_id=tpay_current_actor_id()
     )
   )
   OR
   (
     organization_id IS NULL
     AND current_user='tpay_fortress_operator'
     AND current_setting('tpay.fortress_global_access', true)='true'
     AND EXISTS (
       SELECT 1 FROM fortress_vaults v
       WHERE v.vault_id=fortress_user_data_objects.vault_id
         AND v.vault_scope='global-admin-user'
         AND v.owner_user_id=tpay_current_actor_id()
     )
   )
 );
