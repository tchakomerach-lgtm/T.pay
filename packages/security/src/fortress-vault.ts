import {createHash,randomBytes} from "node:crypto";

export type FortressVaultLayer =
 | "root-trust"|"security"|"recovery"|"identity"|"ai"|"organization"|"finance"|"ledger"
 | "payment"|"wallet"|"credit"|"provider"|"microfinance"|"tontine"|"data-rag"|"document"
 | "social"|"audit-evidence"|"offline-field"|"finance-commission"|"finance-subsidy"|"identity-auth"|"identity-kyc"|"identity-session"|"ai-model"|"ai-tool"|"ai-memory"|"organization-policy"|"organization-members"|"data-knowledge"|"data-pii"|"document-private"|"document-public"|"social-content"|"social-messaging"|"offline-queue"|"audit-security"|"audit-financial";

export type FortressVaultStatus = "active"|"quarantined"|"revoked"|"recovery";

export interface FortressVaultDescriptor {
 readonly vaultId:string;
 readonly layer:FortressVaultLayer;
 readonly organizationId?:string;
 readonly namespace:string;
 readonly classification:"public"|"internal"|"confidential"|"restricted"|"secret";
 readonly keyRef:string;
 readonly status:FortressVaultStatus;
 readonly allowedBridges:readonly string[];
 readonly parentVaultId?:string;
 readonly vaultType:"root"|"general"|"super-admin"|"primary"|"sub";
}

export interface VaultOperation {
 readonly operationId:string;
 readonly sourceVaultId:string;
 readonly targetVaultId:string;
 readonly organizationId:string;
 readonly actorId:string;
 readonly purpose:string;
 readonly action:string;
 readonly dataClass:FortressVaultDescriptor["classification"];
 readonly capabilityId:string;
 readonly correlationId:string;
 readonly payloadHash:string;
 readonly expiresAt:number;
}

export class FortressVaultRegistry {
 private readonly vaults=new Map<string,FortressVaultDescriptor>();

 register(vault:FortressVaultDescriptor):void {
  if(!vault.vaultId.trim()||!vault.namespace.trim()||!vault.keyRef.trim()) throw new Error("FORTRESS_VAULT_IDENTITY_REQUIRED");
  if(this.vaults.has(vault.vaultId)) throw new Error("FORTRESS_VAULT_ALREADY_REGISTERED");
  if(vault.layer==="root-trust" && vault.organizationId) throw new Error("FORTRESS_ROOT_MUST_BE_GLOBAL");
  this.vaults.set(vault.vaultId,{...vault,allowedBridges:[...vault.allowedBridges]});
 }

 get(vaultId:string):FortressVaultDescriptor {
  const vault=this.vaults.get(vaultId);
  if(!vault) throw new Error("FORTRESS_VAULT_NOT_FOUND");
  return vault;
 }

 allowBridge(vaultId:string,bridgeId:string):void {
  const current=this.get(vaultId);
  if(current.layer==="root-trust") throw new Error("FORTRESS_ROOT_BRIDGE_FORBIDDEN");
  if(!bridgeId.trim()) throw new Error("FORTRESS_BRIDGE_ID_REQUIRED");
  if(!current.allowedBridges.includes(bridgeId)) this.vaults.set(vaultId,{...current,allowedBridges:[...current.allowedBridges,bridgeId]});
 }

 setStatus(vaultId:string,status:FortressVaultStatus):void {
  const current=this.get(vaultId);
  this.vaults.set(vaultId,{...current,status});
 }

 assertOperational(vaultId:string):void {
  const vault=this.get(vaultId);
  if(vault.status!=="active") throw new Error("FORTRESS_VAULT_NOT_OPERATIONAL");
 }

 assertTenant(vaultId:string,organizationId:string):void {
  const vault=this.get(vaultId);
  if(vault.organizationId!==undefined && vault.organizationId!==organizationId) throw new Error("FORTRESS_TENANT_BOUNDARY");
 }

 list():readonly FortressVaultDescriptor[]{return [...this.vaults.values()];}
}

export function hashVaultPayload(payload:unknown):string {
 return createHash("sha256").update(JSON.stringify(payload),"utf8").digest("hex");
}

export function createVaultKeyRef(vaultId:string):string {
 return `vault-key:${vaultId}:${randomBytes(16).toString("hex")}`;
}
