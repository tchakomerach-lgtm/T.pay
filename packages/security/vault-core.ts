import {authorizeVaultBoundary,type VaultBoundaryRequest} from "./vault-domain-boundary.js";
import {createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";

export type VaultKeyRef={vaultId:string;keyVersion:number;kmsKeyRef:string;algorithm:"AES-256-GCM"};
export interface VaultKeyProvider{
  decryptDataKey(ref:VaultKeyRef):Promise<Buffer>;
}
export interface VaultAuditSink{
  record(event:{vaultId:string;actorId:string|null;action:"read"|"write"|"seal"|"grant"|"revoke"|"destroy"|"key_rotate"|"deny";objectId?:string;keyVersion?:number;correlationId?:string;reasonCode?:string}):Promise<void>;
}
export interface EncryptedVaultObject{
  nonce:Buffer;
  ciphertext:Buffer;
  authTag:Buffer;
  aadSha256:Buffer;
  payloadSha256:Buffer;
}


function assertVaultBoundary(input:VaultBoundaryRequest,ref:VaultKeyRef,permission:"write"|"decrypt"):void{
  if(input.vault.id!==ref.vaultId||input.requestedPermission!==permission){
    throw new Error("TPAY_VAULT_ACCESS_DENIED:VAULT_PERMISSION_MISMATCH");
  }
  assertVaultAccess(input);
}

function sha256(value:Buffer|string):Buffer{return createHash("sha256").update(value).digest();}

export async function encryptVaultObject(provider:VaultKeyProvider,ref:VaultKeyRef,plaintext:Buffer,aad:string,authorization:VaultBoundaryRequest,audit?:VaultAuditSink,context?:{actorId:string|null;objectId?:string;correlationId?:string}):Promise<EncryptedVaultObject>{
  assertVaultBoundary(authorization,ref,"write");
  if(ref.algorithm!=="AES-256-GCM")throw new Error("TPAY_VAULT_ALGORITHM_UNSUPPORTED");
  const key=await provider.decryptDataKey(ref);
  if(key.length!==32)throw new Error("TPAY_VAULT_DATA_KEY_INVALID");
  const nonce=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",key,nonce);
  const aadBytes=Buffer.from(aad,"utf8");
  cipher.setAAD(aadBytes);
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  const result={nonce,ciphertext,authTag:cipher.getAuthTag(),aadSha256:sha256(aadBytes),payloadSha256:sha256(plaintext)};
  if(audit)await audit.record({vaultId:ref.vaultId,actorId:context?.actorId??null,action:"write",...(context?.objectId!==undefined?{objectId:context.objectId}:{}),keyVersion:ref.keyVersion,...(context?.correlationId!==undefined?{correlationId:context.correlationId}:{})});
  return result;
}

export async function decryptVaultObject(provider:VaultKeyProvider,ref:VaultKeyRef,object:EncryptedVaultObject,aad:string,authorization:VaultBoundaryRequest,audit?:VaultAuditSink,context?:{actorId:string|null;objectId?:string;correlationId?:string}):Promise<Buffer>{
  assertVaultBoundary(authorization,ref,"decrypt");
  if(ref.algorithm!=="AES-256-GCM")throw new Error("TPAY_VAULT_ALGORITHM_UNSUPPORTED");
  if(object.nonce.length!==12||object.authTag.length!==16||object.aadSha256.length!==32||object.payloadSha256.length!==32)throw new Error("TPAY_VAULT_OBJECT_INVALID");
  const aadBytes=Buffer.from(aad,"utf8");
  if(!sha256(aadBytes).equals(object.aadSha256))throw new Error("TPAY_VAULT_AAD_MISMATCH");
  const key=await provider.decryptDataKey(ref);
  if(key.length!==32)throw new Error("TPAY_VAULT_DATA_KEY_INVALID");
  const decipher=createDecipheriv("aes-256-gcm",key,object.nonce);
  decipher.setAAD(aadBytes);
  decipher.setAuthTag(object.authTag);
  const plaintext=Buffer.concat([decipher.update(object.ciphertext),decipher.final()]);
  if(!sha256(plaintext).equals(object.payloadSha256))throw new Error("TPAY_VAULT_PAYLOAD_HASH_MISMATCH");
  if(audit)await audit.record({vaultId:ref.vaultId,actorId:context?.actorId??null,action:"read",...(context?.objectId!==undefined?{objectId:context.objectId}:{}),keyVersion:ref.keyVersion,...(context?.correlationId!==undefined?{correlationId:context.correlationId}:{})});
  return plaintext;
}

export function assertVaultAccess(input:VaultBoundaryRequest):void{
  const decision=authorizeVaultBoundary(input);
  if(!decision.allowed)throw new Error("TPAY_VAULT_ACCESS_DENIED:"+decision.reason);
}
