import {createHash,sign,verify,type KeyObject} from "node:crypto";

export interface FortressChannelEnvelope {
 readonly version:"1";
 readonly messageId:string;
 readonly sourceVaultId:string;
 readonly targetVaultId:string;
 readonly organizationId:string;
 readonly bridgeId:string;
 readonly purpose:string;
 readonly issuedAt:number;
 readonly expiresAt:number;
 readonly sequence:number;
 readonly payloadHash:string;
 readonly signature:string;
}

function canonical(m:Omit<FortressChannelEnvelope,"signature">):string{
 return [m.version,m.messageId,m.sourceVaultId,m.targetVaultId,m.organizationId,m.bridgeId,m.purpose,String(m.issuedAt),String(m.expiresAt),String(m.sequence),m.payloadHash].join("|");
}

export function createFortressChannelEnvelope(
 input:Omit<FortressChannelEnvelope,"version"|"payloadHash"|"signature">&{payload:Buffer},
 privateKey:KeyObject
):FortressChannelEnvelope{
 if(!input.messageId.trim()||!input.sourceVaultId.trim()||!input.targetVaultId.trim()||!input.organizationId.trim()||!input.bridgeId.trim())throw new Error("FORTRESS_CHANNEL_CONTEXT_REQUIRED");
 if(input.sourceVaultId===input.targetVaultId)throw new Error("FORTRESS_CHANNEL_SELF_TARGET");
 if(input.expiresAt<=input.issuedAt)throw new Error("FORTRESS_CHANNEL_EXPIRY_INVALID");
 if(!Number.isSafeInteger(input.sequence)||input.sequence<0)throw new Error("FORTRESS_CHANNEL_SEQUENCE_INVALID");
 const payloadHash=createHash("sha256").update(input.payload).digest("hex");
 const unsigned={...input,version:"1" as const,payloadHash};
 const signature=sign(null,Buffer.from(canonical(unsigned),"utf8"),privateKey).toString("base64url");
 return {...unsigned,signature};
}

export function verifyFortressChannelEnvelope(
 envelope:FortressChannelEnvelope,
 publicKey:KeyObject,
 expected:{organizationId:string;targetVaultId:string;bridgeId:string;minSequence:number;now?:number;maxClockSkewMs?:number}
):void{
 const now=expected.now??Date.now(), skew=expected.maxClockSkewMs??30_000;
 if(envelope.organizationId!==expected.organizationId)throw new Error("FORTRESS_CHANNEL_TENANT_MISMATCH");
 if(envelope.targetVaultId!==expected.targetVaultId)throw new Error("FORTRESS_CHANNEL_TARGET_MISMATCH");
 if(envelope.bridgeId!==expected.bridgeId)throw new Error("FORTRESS_CHANNEL_BRIDGE_MISMATCH");
 if(envelope.expiresAt<=now||envelope.issuedAt-now>skew)throw new Error("FORTRESS_CHANNEL_TIME_INVALID");
 if(envelope.sequence<expected.minSequence)throw new Error("FORTRESS_CHANNEL_SEQUENCE_REPLAY");
 const unsigned={version:envelope.version,messageId:envelope.messageId,sourceVaultId:envelope.sourceVaultId,targetVaultId:envelope.targetVaultId,organizationId:envelope.organizationId,bridgeId:envelope.bridgeId,purpose:envelope.purpose,issuedAt:envelope.issuedAt,expiresAt:envelope.expiresAt,sequence:envelope.sequence,payloadHash:envelope.payloadHash};
 if(!verify(null,Buffer.from(canonical(unsigned),"utf8"),publicKey,Buffer.from(envelope.signature,"base64url")))throw new Error("FORTRESS_CHANNEL_SIGNATURE_INVALID");
}

export function assertPayloadHash(envelope:FortressChannelEnvelope,payload:Buffer):void{
 const expected=createHash("sha256").update(payload).digest("hex");
 if(expected!==envelope.payloadHash)throw new Error("FORTRESS_CHANNEL_PAYLOAD_TAMPERED");
}
