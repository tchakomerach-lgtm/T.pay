import {createHash,sign,verify,type KeyObject} from "node:crypto";

export interface SignedAgentMessage{
 readonly version:"1";
 readonly messageId:string;
 readonly sourceAgentId:string;
 readonly targetAgentId:string;
 readonly organizationId:string;
 readonly purpose:string;
 readonly nonce:string;
 readonly issuedAt:number;
 readonly expiresAt:number;
 readonly payloadHash:string;
 readonly signature:string;
}

function canonical(m:Omit<SignedAgentMessage,"signature">):string{
 return [m.version,m.messageId,m.sourceAgentId,m.targetAgentId,m.organizationId,m.purpose,m.nonce,String(m.issuedAt),String(m.expiresAt),m.payloadHash].join("|");
}

export function createSignedAgentMessage(input:Omit<SignedAgentMessage,"version"|"signature"|"payloadHash">&{payload:string},privateKey:KeyObject):SignedAgentMessage{
 if(!input.messageId.trim()||!input.sourceAgentId.trim()||!input.targetAgentId.trim()||!input.organizationId.trim()||!input.purpose.trim()||!input.nonce.trim())throw new Error("AGENT_MESSAGE_CONTEXT_REQUIRED");
 if(input.sourceAgentId===input.targetAgentId)throw new Error("AGENT_MESSAGE_SELF_TARGET_DENIED");
 if(input.expiresAt<=input.issuedAt)throw new Error("AGENT_MESSAGE_EXPIRY_INVALID");
 const payloadHash=createHash("sha256").update(input.payload,"utf8").digest("hex");
 const unsigned={...input,version:"1" as const,payloadHash};
 const signature=sign(null,Buffer.from(canonical(unsigned),"utf8"),privateKey).toString("base64url");
 return {...unsigned,signature};
}

export function verifySignedAgentMessage(message:SignedAgentMessage,publicKey:KeyObject,expected:{organizationId:string;targetAgentId:string;now?:number;maxClockSkewMs?:number}):void{
 const now=expected.now??Date.now();
 const skew=expected.maxClockSkewMs??30_000;
 if(message.organizationId!==expected.organizationId)throw new Error("AGENT_MESSAGE_TENANT_MISMATCH");
 if(message.targetAgentId!==expected.targetAgentId)throw new Error("AGENT_MESSAGE_TARGET_MISMATCH");
 if(message.expiresAt<=now||message.issuedAt-now>skew)throw new Error("AGENT_MESSAGE_TIME_INVALID");
 const unsigned={version:message.version,messageId:message.messageId,sourceAgentId:message.sourceAgentId,targetAgentId:message.targetAgentId,organizationId:message.organizationId,purpose:message.purpose,nonce:message.nonce,issuedAt:message.issuedAt,expiresAt:message.expiresAt,payloadHash:message.payloadHash};
 if(!verify(null,Buffer.from(canonical(unsigned),"utf8"),publicKey,Buffer.from(message.signature,"base64url")))throw new Error("AGENT_MESSAGE_SIGNATURE_INVALID");
}
