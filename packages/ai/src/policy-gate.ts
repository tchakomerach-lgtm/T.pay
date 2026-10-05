import type { AiActionEnvelope, AiActionRisk } from "./action-envelope.js";
import type { AiCapability } from "./capability-policy.js";
import { validateCapability,CapabilityRevocationRegistry } from "./capability-policy.js";
export interface AiPolicyDecision { readonly allowed:boolean; readonly reason:string; readonly approvalRequired:boolean; }
const highImpact=new Set<AiActionRisk>(["L4","L5"]);
export class AiPolicyGate {
 private enabled=true; private readonly revocations:CapabilityRevocationRegistry;
 constructor(revocations=new CapabilityRevocationRegistry()){this.revocations=revocations;}
 disable(reason:string):void{if(!reason.trim())throw new Error("AI_KILL_SWITCH_REASON_REQUIRED");this.enabled=false;}
 enable():void{this.enabled=true;} isEnabled():boolean{return this.enabled;}
 getRevocationRegistry():CapabilityRevocationRegistry{return this.revocations;}
 evaluate(action:AiActionEnvelope,capability?:AiCapability,approved=false):AiPolicyDecision{
  if(!this.enabled)return{allowed:false,reason:"AI_KILL_SWITCH_ACTIVE",approvalRequired:false};
  if(action.risk==="L5")return{allowed:false,reason:"AI_ROOT_ACTION_FORBIDDEN",approvalRequired:false};
  if(!capability)return{allowed:false,reason:"AI_CAPABILITY_REQUIRED",approvalRequired:highImpact.has(action.risk)};
  try{validateCapability(capability,action,Date.now(),this.revocations);}catch(error){return{allowed:false,reason:error instanceof Error?error.message:"AI_CAPABILITY_INVALID",approvalRequired:highImpact.has(action.risk)};}
  const approvalRequired=highImpact.has(action.risk);
  if(approvalRequired&&!approved)return{allowed:false,reason:"AI_HUMAN_APPROVAL_REQUIRED",approvalRequired:true};
  return{allowed:true,reason:"AI_POLICY_ALLOW",approvalRequired};
 }
 assertAllowed(action:AiActionEnvelope,capability?:AiCapability,approved=false):void{const d=this.evaluate(action,capability,approved);if(!d.allowed)throw new Error(d.reason);}
}
