import {createHash} from "node:crypto";
import {FortressVaultRegistry,type VaultOperation} from "./fortress-vault.js";
import type {AuthorizationContext,AuthorizationRule} from "./authorization-context.js";
import {assertAuthorized} from "./authorization-context.js";
import type {ReplayStore} from "./distributed-replay-store.js";
import type {CapabilityRevocationStore} from "../ai/persistent-capability-revocation.js";
import type {PostgresSecurityAuditStore} from "./postgres-security-audit.js";

export interface FortressBridgePolicy {
 readonly bridgeId:string; readonly sourceVaultId:string; readonly targetVaultId:string;
 readonly allowedPurposes:readonly string[]; readonly allowedActions:readonly string[];
 readonly allowedDataClasses:readonly string[]; readonly maxTtlMs:number;
 readonly requiredRoles?:readonly string[];
 readonly requiredTrustedDevice?:boolean;
 readonly maxSessionAgeMs?:number;
}

export interface FortressGatewayDependencies {
 readonly replayStore?:ReplayStore;
 readonly capabilityRevocationStore?:CapabilityRevocationStore;
 readonly auditStore?:PostgresSecurityAuditStore;
 readonly authorization?:{context:AuthorizationContext;rule:AuthorizationRule};
}

export class FortressSecurityGateway {
 private readonly policies=new Map<string,FortressBridgePolicy>();
 constructor(private readonly registry:FortressVaultRegistry,private readonly deps:FortressGatewayDependencies={}){}

 registerBridge(policy:FortressBridgePolicy):void {
  if(policy.maxTtlMs<=0||policy.maxTtlMs>300_000) throw new Error("FORTRESS_BRIDGE_TTL_INVALID");
  if(this.policies.has(policy.bridgeId)) throw new Error("FORTRESS_BRIDGE_ALREADY_REGISTERED");
  if(policy.sourceVaultId===policy.targetVaultId) throw new Error("FORTRESS_BRIDGE_SELF_TARGET");
  this.registry.get(policy.sourceVaultId); this.registry.get(policy.targetVaultId);
  this.policies.set(policy.bridgeId,{...policy,allowedPurposes:[...policy.allowedPurposes],allowedActions:[...policy.allowedActions],allowedDataClasses:[...policy.allowedDataClasses]});
  this.registry.allowBridge(policy.sourceVaultId,policy.bridgeId);
 }

 async authorize(operation:VaultOperation,now=Date.now()):Promise<void> {
  if(!operation.operationId||!operation.correlationId||!operation.capabilityId) throw new Error("FORTRESS_OPERATION_CONTEXT_REQUIRED");
  if(operation.sourceVaultId===operation.targetVaultId) throw new Error("FORTRESS_DIRECT_SELF_OPERATION");
  if(operation.expiresAt<=now) throw new Error("FORTRESS_OPERATION_EXPIRED");
  const source=this.registry.get(operation.sourceVaultId), target=this.registry.get(operation.targetVaultId);
  this.registry.assertOperational(source.vaultId); this.registry.assertOperational(target.vaultId);
  this.registry.assertTenant(source.vaultId,operation.organizationId); this.registry.assertTenant(target.vaultId,operation.organizationId);
  const policy=[...this.policies.values()].find(p=>p.sourceVaultId===source.vaultId&&p.targetVaultId===target.vaultId&&source.allowedBridges.includes(p.bridgeId)&&p.allowedPurposes.includes(operation.purpose)&&p.allowedActions.includes(operation.action)&&p.allowedDataClasses.includes(operation.dataClass));
  if(!policy) throw new Error("FORTRESS_BRIDGE_POLICY_DENIED");
  if(operation.expiresAt-now>policy.maxTtlMs) throw new Error("FORTRESS_OPERATION_TTL_EXCEEDED");
  if(this.deps.authorization) assertAuthorized(this.deps.authorization.context,{...this.deps.authorization.rule,action:operation.action,requiredRoles:policy.requiredRoles??this.deps.authorization.rule.requiredRoles,allowedDataClasses:policy.allowedDataClasses,requiredPurpose:operation.purpose,requireTrustedDevice:policy.requiredTrustedDevice??this.deps.authorization.rule.requireTrustedDevice,maxSessionAgeMs:policy.maxSessionAgeMs??this.deps.authorization.rule.maxSessionAgeMs});
  if(this.deps.capabilityRevocationStore){\n   if(await this.deps.capabilityRevocationStore.isRevoked(operation.capabilityId)) throw new Error("FORTRESS_CAPABILITY_REVOKED");\n   if(await this.deps.capabilityRevocationStore.isGloballyRevoked()) throw new Error("FORTRESS_CAPABILITY_GLOBAL_REVOCATION_ACTIVE");\n  }
  if(this.deps.replayStore){
   const claimed=await this.deps.replayStore.claim({scope:`org:${operation.organizationId}`,actionId:operation.operationId,payloadHash:operation.payloadHash,expiresAt:operation.expiresAt},now);
   if(!claimed) throw new Error("FORTRESS_REPLAY_DETECTED");
  }
  if(this.deps.auditStore){
   await this.deps.auditStore.append({eventId:`fortress:${operation.operationId}`,organizationId:operation.organizationId,actorId:operation.actorId,correlationId:operation.correlationId,eventType:"FORTRESS_BRIDGE_AUTHORIZED",severity:"info",timestamp:now,payloadHash:operation.payloadHash});
  }
 }

 async bridgeDigest(operation:VaultOperation):Promise<string> {
  await this.authorize(operation);
  return createHash("sha256").update(JSON.stringify(operation),"utf8").digest("hex");
 }

 quarantineVault(vaultId:string):void { this.registry.setStatus(vaultId,"quarantined"); }
}