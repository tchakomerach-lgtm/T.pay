ALTER TABLE fortress_vaults
 ADD COLUMN IF NOT EXISTS parent_vault_id TEXT REFERENCES fortress_vaults(vault_id),
 ADD COLUMN IF NOT EXISTS vault_type TEXT NOT NULL DEFAULT 'primary';

ALTER TABLE fortress_vaults DROP CONSTRAINT IF EXISTS fortress_vault_type_check;
ALTER TABLE fortress_vaults ADD CONSTRAINT fortress_vault_type_check CHECK (vault_type IN ('root','primary','sub'));

CREATE INDEX IF NOT EXISTS fortress_vaults_parent_idx ON fortress_vaults(parent_vault_id);

ALTER TABLE fortress_vaults DROP CONSTRAINT IF EXISTS fortress_root_parent_check;
ALTER TABLE fortress_vaults ADD CONSTRAINT fortress_root_parent_check
 CHECK ((vault_type='root' AND parent_vault_id IS NULL) OR (vault_type IN ('primary','sub') AND vault_id <> 'root-trust'));

ALTER TABLE fortress_bridge_policies
 ADD COLUMN IF NOT EXISTS source_scope TEXT NOT NULL DEFAULT 'vault',
 ADD COLUMN IF NOT EXISTS target_scope TEXT NOT NULL DEFAULT 'vault';

CREATE INDEX IF NOT EXISTS fortress_bridges_scope_idx ON fortress_bridge_policies(source_vault_id,target_vault_id,status);
