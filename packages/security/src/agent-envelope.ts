import {createHash} from "node:crypto";
export interface AgentEnvelope { readonly version:"1"; readonly messageId:string; readonly sourceAgentId:string; readonly targetAgentId:string; readonly organizationId:string; readonly purpose:string; readonly payload:string; readonly payloadHash:string; readonly expiresAt:number; }
export function createAgentEnvelope(input:Omit<AgentEnvelope,"version"|"payloadHash">):AgentEnvelope{
  if(!input.messageId.trim()||!input.sourceAgentId.trim()||!input.targetAgentId.trim()||!input.organizationId.trim()||!input.purpose.trim())throw new Error("AGENT_ENVELOPE_CONTEXT_REQUIRED");
  if(input.expiresAt<=Date.now())throw new Error("AGENT_ENVELOPE_EXPIRED");
  const payloadHash=createHash("sha256").update(input.payload,"utf8").digest("hex");
  return {...input,version:"1",payloadHash};
}
export function validateAgentEnvelope(envelope:AgentEnvelope,expected:{organizationId:string;targetAgentId:string},now=Date.now()):void{
  if(envelope.organizationId!==expected.organizationId)throw new Error("AGENT_ENVELOPE_TENANT_MISMATCH");
  if(envelope.targetAgentId!==expected.targetAgentId)throw new Error("AGENT_ENVELOPE_TARGET_MISMATCH");
  if(now>=envelope.expiresAt)throw new Error("AGENT_ENVELOPE_EXPIRED");
  const expectedHash=createHash("sha256").update(envelope.payload,"utf8").digest("hex");
  if(expectedHash!==envelope.payloadHash)throw new Error("AGENT_ENVELOPE_HASH_MISMATCH");
}