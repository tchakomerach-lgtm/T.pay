import {createHash} from "node:crypto";
import {FortressVaultRegistry,type VaultOperation} from "./fortress-vault.js";

export interface FortressBridgePolicy {
 readonly bridgeId:string;
 readonly sourceVaultId:string;
 readonly targetVaultId:string;
 readonly allowedPurposes:readonly string[];
 readonly allowedActions:readonly string[];
 readonly allowedDataClasses:readonly string[];
 readonly maxTtlMs:number;
}

export class FortressSecurityGateway {
 private readonly policies=new Map<string,FortressBridgePolicy>();
 constructor(private readonly registry:FortressVaultRegistry){}

 registerBridge(policy:FortressBridgePolicy):void {
  if(policy.maxTtlMs<=0||policy.maxTtlMs>300_000) throw new Error("FORTRESS_BRIDGE_TTL_INVALID");
  if(this.policies.has(policy.bridgeId)) throw new Error("FORTRESS_BRIDGE_ALREADY_REGISTERED");
  if(policy.sourceVaultId===policy.targetVaultId) throw new Error("FORTRESS_BRIDGE_SELF_TARGET");
  this.registry.get(policy.sourceVaultId); this.registry.get(policy.targetVaultId);
  this.policies.set(policy.bridgeId,{...policy,allowedPurposes:[...policy.allowedPurposes],allowedActions:[...policy.allowedActions],allowedDataClasses:[...policy.allowedDataClasses]});
 }

 authorize(operation:VaultOperation,now=Date.now()):void {
  if(!operation.operationId||!operation.correlationId||!operation.capabilityId) throw new Error("FORTRESS_OPERATION_CONTEXT_REQUIRED");
  if(operation.sourceVaultId===operation.targetVaultId) throw new Error("FORTRESS_DIRECT_SELF_OPERATION");
  if(operation.expiresAt<=now) throw new Error("FORTRESS_OPERATION_EXPIRED");
  const source=this.registry.get(operation.sourceVaultId);
  const target=this.registry.get(operation.targetVaultId);
  this.registry.assertOperational(operation.sourceVaultId);
  this.registry.assertOperational(operation.targetVaultId);
  this.registry.assertTenant(operation.sourceVaultId,operation.organizationId);
  this.registry.assertTenant(operation.targetVaultId,operation.organizationId);
  const candidates=[...this.policies.values()].filter(p=>p.sourceVaultId===source.vaultId&&p.targetVaultId===target.vaultId&&source.allowedBridges.includes(p.bridgeId));
  const policy=candidates.find(p=>p.allowedPurposes.includes(operation.purpose)&&p.allowedActions.includes(operation.action)&&p.allowedDataClasses.includes(operation.dataClass));
  if(!policy) throw new Error("FORTRESS_BRIDGE_POLICY_DENIED");
  if(operation.expiresAt-now>policy.maxTtlMs) throw new Error("FORTRESS_OPERATION_TTL_EXCEEDED");
 }

 bridgeDigest(operation:VaultOperation):string {
  this.authorize(operation);
  return createHash("sha256").update(JSON.stringify(operation),"utf8").digest("hex");
 }

 quarantineVault(vaultId:string):void {
  this.registry.setStatus(vaultId,"quarantined");
 }
}
