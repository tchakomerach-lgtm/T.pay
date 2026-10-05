import type { AiActionRisk, AiActionEnvelope } from "./action-envelope.js";

export interface AiCapability {
  readonly capabilityId:string; readonly agentId:string; readonly organizationId:string; readonly actorId:string;
  readonly purpose:string; readonly toolName:string; readonly dataClasses:readonly string[]; readonly risk:AiActionRisk;
  readonly issuedAt:number; readonly expiresAt:number;
}
export interface AiCapabilityRequest {
  readonly capabilityId:string; readonly agentId:string; readonly organizationId:string; readonly actorId:string;
  readonly purpose:string; readonly toolName:string; readonly dataClasses:readonly string[]; readonly risk:AiActionRisk; readonly ttlMs:number;
}
const maxTtlByRisk:Record<AiActionRisk,number>={L0:300_000,L1:120_000,L2:60_000,L3:60_000,L4:30_000,L5:0};

export class CapabilityRevocationRegistry {
  private readonly revoked=new Map<string,{revokedAt:number;reason:string}>();
  private globallyRevoked=false;
  revoke(capabilityId:string,reason:string,now=Date.now()):void {
    if(!capabilityId.trim()||!reason.trim()) throw new Error("AI_CAPABILITY_REVOCATION_CONTEXT_REQUIRED");
    this.revoked.set(capabilityId,{revokedAt:now,reason});
  }
  revokeAll(reason:string):void { if(!reason.trim()) throw new Error("AI_CAPABILITY_REVOCATION_REASON_REQUIRED"); this.globallyRevoked=true; }
  restoreAll():void { this.globallyRevoked=false; }
  isRevoked(capabilityId:string):boolean { return this.globallyRevoked||this.revoked.has(capabilityId); }
  assertActive(capabilityId:string):void { if(this.globallyRevoked) throw new Error("AI_CAPABILITY_GLOBAL_REVOCATION_ACTIVE"); if(this.revoked.has(capabilityId)) throw new Error("AI_CAPABILITY_REVOKED"); }
}

export function issueCapability(request:AiCapabilityRequest,now=Date.now()):AiCapability {
  if(!request.capabilityId.trim()||!request.agentId.trim()||!request.organizationId.trim()||!request.actorId.trim()) throw new Error("AI_CAPABILITY_SCOPE_REQUIRED");
  if(!request.purpose.trim()||!request.toolName.trim()) throw new Error("AI_CAPABILITY_PURPOSE_REQUIRED");
  if(request.dataClasses.length===0) throw new Error("AI_CAPABILITY_DATA_CLASS_REQUIRED");
  const maxTtl=maxTtlByRisk[request.risk];
  if(maxTtl===0||request.ttlMs<1||request.ttlMs>maxTtl) throw new Error("AI_CAPABILITY_TTL_INVALID");
  return {...request,issuedAt:now,expiresAt:now+request.ttlMs};
}
export function validateCapability(capability:AiCapability,action:AiActionEnvelope,now=Date.now(),registry?:CapabilityRevocationRegistry):void {
  registry?.assertActive(capability.capabilityId);
  if(capability.agentId!==action.agentId||capability.organizationId!==action.organizationId||capability.actorId!==action.actorId) throw new Error("AI_CAPABILITY_SCOPE_MISMATCH");
  if(capability.toolName!==action.toolName||capability.purpose!==action.purpose||capability.risk!==action.risk) throw new Error("AI_CAPABILITY_ACTION_MISMATCH");
  if(now>=capability.expiresAt||now>=action.expiresAt) throw new Error("AI_CAPABILITY_EXPIRED");
  if(action.createdAt<capability.issuedAt||action.createdAt>capability.expiresAt) throw new Error("AI_CAPABILITY_TIME_INVALID");
}
