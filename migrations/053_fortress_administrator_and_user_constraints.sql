ALTER TABLE fortress_vaults DROP CONSTRAINT IF EXISTS fortress_global_vault_identity_check;
ALTER TABLE fortress_vaults ADD CONSTRAINT fortress_global_vault_identity_check
 CHECK (
   (organization_id IS NOT NULL AND vault_type IN ('primary','sub'))
   OR (organization_id IS NULL AND vault_type IN ('root','general','administrator'))
 );

ALTER TABLE fortress_vaults DROP CONSTRAINT IF EXISTS fortress_general_parent_check;
ALTER TABLE fortress_vaults ADD CONSTRAINT fortress_general_parent_check
 CHECK (
   (vault_type='root' AND parent_vault_id IS NULL)
   OR (vault_type='general' AND parent_vault_id='root-trust')
   OR (vault_type='administrator' AND parent_vault_id='general-fortress')
   OR (vault_type='primary' AND parent_vault_id='general-fortress')
   OR (vault_type='sub' AND parent_vault_id IS NOT NULL)
 );

ALTER TABLE fortress_vaults DROP CONSTRAINT IF EXISTS fortress_user_scope_parent_check;
ALTER TABLE fortress_vaults ADD CONSTRAINT fortress_user_scope_parent_check
 CHECK (
   (vault_scope='system')
   OR (vault_scope='tenant-user' AND parent_vault_id IS NOT NULL AND organization_id IS NOT NULL)
   OR (vault_scope='global-admin-user' AND parent_vault_id IS NOT NULL AND organization_id IS NULL)
 );

COMMENT ON TABLE fortress_vaults IS 'T.Pay Fortress topology and user-scoped cryptographic compartments. Parentage is topology only; keys never inherit.';
