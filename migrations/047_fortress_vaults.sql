CREATE TABLE IF NOT EXISTS fortress_vaults (
 vault_id TEXT PRIMARY KEY,
 layer TEXT NOT NULL,
 organization_id TEXT,
 namespace TEXT NOT NULL UNIQUE,
 classification TEXT NOT NULL,
 key_ref TEXT NOT NULL,
 status TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (status IN ('active','quarantined','revoked','recovery')),
 CHECK (classification IN ('public','internal','confidential','restricted','secret'))
);

CREATE TABLE IF NOT EXISTS fortress_bridge_policies (
 bridge_id TEXT PRIMARY KEY,
 source_vault_id TEXT NOT NULL REFERENCES fortress_vaults(vault_id),
 target_vault_id TEXT NOT NULL REFERENCES fortress_vaults(vault_id),
 allowed_purposes TEXT[] NOT NULL,
 allowed_actions TEXT[] NOT NULL,
 allowed_data_classes TEXT[] NOT NULL,
 max_ttl_ms BIGINT NOT NULL CHECK (max_ttl_ms > 0 AND max_ttl_ms <= 300000),
 status TEXT NOT NULL DEFAULT 'active',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (source_vault_id <> target_vault_id),
 CHECK (status IN ('active','revoked'))
);

CREATE INDEX IF NOT EXISTS fortress_vaults_org_idx ON fortress_vaults(organization_id);
CREATE INDEX IF NOT EXISTS fortress_bridges_source_target_idx ON fortress_bridge_policies(source_vault_id,target_vault_id);

ALTER TABLE fortress_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE fortress_bridge_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fortress_vaults_tenant_policy ON fortress_vaults;
CREATE POLICY fortress_vaults_tenant_policy ON fortress_vaults
 USING (organization_id IS NULL OR organization_id = tpay_current_organization_id())
 WITH CHECK (organization_id IS NULL OR organization_id = tpay_current_organization_id());

DROP POLICY IF EXISTS fortress_bridges_tenant_policy ON fortress_bridge_policies;
CREATE POLICY fortress_bridges_tenant_policy ON fortress_bridge_policies
 USING (
   EXISTS (
     SELECT 1 FROM fortress_vaults s
     WHERE s.vault_id = source_vault_id
       AND (s.organization_id IS NULL OR s.organization_id = tpay_current_organization_id())
   )
 )
 WITH CHECK (
   EXISTS (
     SELECT 1 FROM fortress_vaults s
     WHERE s.vault_id = source_vault_id
       AND (s.organization_id IS NULL OR s.organization_id = tpay_current_organization_id())
   )
 );

REVOKE ALL ON fortress_vaults, fortress_bridge_policies FROM PUBLIC;
