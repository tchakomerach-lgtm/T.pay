import {createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";

export type VaultClassification="secret"|"credential"|"pii"|"financial"|"security_key";

export interface VaultEnvelope{
  version:1;
  algorithm:"aes-256-gcm";
  keyVersion:string;
  nonce:string;
  ciphertext:string;
  authTag:string;
  aadHash:string;
  classification:VaultClassification;
}

export interface VaultKeyProvider{
  getKey(keyVersion:string):Promise<Buffer>;
}

const aadFor=(tenantId:string,organizationId:string,secretId:string,classification:VaultClassification)=>{
  const aad=Buffer.from(JSON.stringify({tenantId,organizationId,secretId,classification}));
  return {aad,aadHash:createHash("sha256").update(aad).digest("hex")};
};

export async function sealVaultSecret(input:{
  tenantId:string; organizationId:string; secretId:string;
  plaintext:Buffer|string; classification:VaultClassification;
  keyVersion:string; keys:VaultKeyProvider;
}):Promise<VaultEnvelope>{
  const key=await input.keys.getKey(input.keyVersion);
  if(key.length!==32)throw new Error("TPAY_VAULT_KEY_INVALID");
  const {aad,aadHash}=aadFor(input.tenantId,input.organizationId,input.secretId,input.classification);
  const nonce=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",key,nonce);
  cipher.setAAD(aad);
  const ciphertext=Buffer.concat([cipher.update(Buffer.from(input.plaintext)),cipher.final()]);
  return {
    version:1,algorithm:"aes-256-gcm",keyVersion:input.keyVersion,
    nonce:nonce.toString("base64url"),ciphertext:ciphertext.toString("base64url"),
    authTag:cipher.getAuthTag().toString("base64url"),aadHash,
    classification:input.classification
  };
}

export async function openVaultSecret(input:{
  tenantId:string; organizationId:string; secretId:string;
  envelope:VaultEnvelope; keys:VaultKeyProvider;
}):Promise<Buffer>{
  if(input.envelope.version!==1||input.envelope.algorithm!=="aes-256-gcm")throw new Error("TPAY_VAULT_ENVELOPE_UNSUPPORTED");
  const key=await input.keys.getKey(input.envelope.keyVersion);
  if(key.length!==32)throw new Error("TPAY_VAULT_KEY_INVALID");
  const {aad,aadHash}=aadFor(input.tenantId,input.organizationId,input.secretId,input.envelope.classification);
  if(aadHash!==input.envelope.aadHash)throw new Error("TPAY_VAULT_AAD_TAMPERED");
  const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(input.envelope.nonce,"base64url"));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(input.envelope.authTag,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(input.envelope.ciphertext,"base64url")),decipher.final()]);
}

export const fingerprintSecret=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");
