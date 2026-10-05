import {randomBytes} from "node:crypto";
export interface AgentTrustEnvelope{
 readonly envelopeId:string; readonly sourceAgentId:string; readonly targetAgentId:string; readonly organizationId:string;
 readonly audience:string; readonly purpose:string; readonly nonce:string; readonly issuedAt:number; readonly expiresAt:number;
 readonly delegatedCapabilities:readonly string[];
}
export function createAgentTrustEnvelope(input:Omit<AgentTrustEnvelope,"nonce">):AgentTrustEnvelope{
 if(!input.envelopeId.trim()||!input.sourceAgentId.trim()||!input.targetAgentId.trim()||!input.organizationId.trim()||!input.audience.trim()||!input.purpose.trim())throw new Error("AGENT_TRUST_CONTEXT_REQUIRED");
 if(input.sourceAgentId===input.targetAgentId)throw new Error("AGENT_TRUST_SELF_TARGET_FORBIDDEN");
 if(input.expiresAt<=input.issuedAt)throw new Error("AGENT_TRUST_EXPIRY_INVALID");
 return{...input,nonce:randomBytes(16).toString("hex")};
}
export function validateAgentTrustEnvelope(e:AgentTrustEnvelope,expected:{organizationId:string;targetAgentId:string;audience:string},now=Date.now()):void{
 if(e.organizationId!==expected.organizationId)throw new Error("AGENT_TRUST_TENANT_MISMATCH");
 if(e.targetAgentId!==expected.targetAgentId)throw new Error("AGENT_TRUST_TARGET_MISMATCH");
 if(e.audience!==expected.audience)throw new Error("AGENT_TRUST_AUDIENCE_MISMATCH");
 if(now>=e.expiresAt||now<e.issuedAt)throw new Error("AGENT_TRUST_EXPIRED");
 if(e.delegatedCapabilities.length>0)throw new Error("AGENT_TRUST_PRIVILEGE_AMPLIFICATION_FORBIDDEN");
 if(!/^[0-9a-f]{32}$/i.test(e.nonce))throw new Error("AGENT_TRUST_NONCE_INVALID");
}
