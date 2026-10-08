import type {Client} from "pg";
import type {FortressVaultDescriptor} from "./fortress-vault.js";
import type {FortressBridgePolicy} from "./fortress-bridge.js";

export class PostgresFortressStore {
 constructor(private readonly client:Client){}

 async upsertVault(vault:FortressVaultDescriptor):Promise<void>{
  await this.client.query(
   `INSERT INTO fortress_vaults(vault_id,layer,organization_id,namespace,classification,key_ref,status)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(vault_id) DO UPDATE SET layer=EXCLUDED.layer,organization_id=EXCLUDED.organization_id,
      namespace=EXCLUDED.namespace,classification=EXCLUDED.classification,key_ref=EXCLUDED.key_ref,
      status=EXCLUDED.status,updated_at=now()`,
   [vault.vaultId,vault.layer,vault.organizationId??null,vault.namespace,vault.classification,vault.keyRef,vault.status]
  );
 }

 async setVaultStatus(vaultId:string,status:FortressVaultDescriptor["status"]):Promise<void>{
  const result=await this.client.query(
   "UPDATE fortress_vaults SET status=$2,updated_at=now() WHERE vault_id=$1",
   [vaultId,status]
  );
  if(result.rowCount!==1) throw new Error("FORTRESS_VAULT_NOT_FOUND");
 }

 async registerBridge(policy:FortressBridgePolicy):Promise<void>{
  await this.client.query(
   `INSERT INTO fortress_bridge_policies
    (bridge_id,source_vault_id,target_vault_id,allowed_purposes,allowed_actions,allowed_data_classes,max_ttl_ms,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,'active')
    ON CONFLICT(bridge_id) DO UPDATE SET source_vault_id=EXCLUDED.source_vault_id,
      target_vault_id=EXCLUDED.target_vault_id,allowed_purposes=EXCLUDED.allowed_purposes,
      allowed_actions=EXCLUDED.allowed_actions,allowed_data_classes=EXCLUDED.allowed_data_classes,
      max_ttl_ms=EXCLUDED.max_ttl_ms,status='active'`,
   [policy.bridgeId,policy.sourceVaultId,policy.targetVaultId,[...policy.allowedPurposes],[...policy.allowedActions],[...policy.allowedDataClasses],policy.maxTtlMs]
  );
 }

 async revokeBridge(bridgeId:string):Promise<void>{
  const result=await this.client.query(
   "UPDATE fortress_bridge_policies SET status='revoked' WHERE bridge_id=$1",
   [bridgeId]
  );
  if(result.rowCount!==1) throw new Error("FORTRESS_BRIDGE_NOT_FOUND");
 }
}
