import {createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";

export interface FortressKeyProvider {
 readonly productionReady:boolean;
 wrapKey(vaultId:string,plaintextKey:Buffer):Promise<string>;
 unwrapKey(vaultId:string,wrappedKey:string):Promise<Buffer>;
}

export class ExternalKmsKeyProvider implements FortressKeyProvider {
 readonly productionReady=false;
 async wrapKey(_vaultId:string,_plaintextKey:Buffer):Promise<string>{throw new Error("FORTRESS_KMS_PROVIDER_NOT_CONFIGURED");}
 async unwrapKey(_vaultId:string,_wrappedKey:string):Promise<Buffer>{throw new Error("FORTRESS_KMS_PROVIDER_NOT_CONFIGURED");}
}

/** Test-only provider. Never use this implementation for production root keys. */
export class TestOnlyKeyProvider implements FortressKeyProvider {
 readonly productionReady=false;
 private readonly root= randomBytes(32);
 private readonly keys=new Map<string,Buffer>();
 async wrapKey(vaultId:string,plaintextKey:Buffer):Promise<string>{
  if(!vaultId.trim()||plaintextKey.length!==32) throw new Error("FORTRESS_KEY_INPUT_INVALID");
  const nonce=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",this.derive(vaultId),nonce);
  const ciphertext=Buffer.concat([cipher.update(plaintextKey),cipher.final()]);
  const tag=cipher.getAuthTag();
  return Buffer.concat([nonce,tag,ciphertext]).toString("base64url");
 }
 async unwrapKey(vaultId:string,wrappedKey:string):Promise<Buffer>{
  const raw=Buffer.from(wrappedKey,"base64url");
  if(raw.length<29) throw new Error("FORTRESS_WRAPPED_KEY_INVALID");
  const decipher=createDecipheriv("aes-256-gcm",this.derive(vaultId),raw.subarray(0,12));
  decipher.setAuthTag(raw.subarray(12,28));
  return Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]);
 }
 private derive(vaultId:string):Buffer{return createHash("sha256").update(this.root).update(vaultId).digest();}
}

export interface VaultKeyMaterial {readonly vaultId:string;readonly keyRef:string;readonly wrappedDek:string;}


export async function encryptForVault(provider:FortressKeyProvider,material:VaultKeyMaterial,plaintext:Buffer):Promise<string>{
 const key=await provider.unwrapKey(material.vaultId,material.wrappedDek);
 try{
  const nonce=randomBytes(12); const cipher=createCipheriv("aes-256-gcm",key,nonce);
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]).toString("base64url");
 } finally { key.fill(0); }
}

export async function decryptForVault(provider:FortressKeyProvider,material:VaultKeyMaterial,ciphertext:string):Promise<Buffer>{
 const key=await provider.unwrapKey(material.vaultId,material.wrappedDek);
 try{
  const raw=Buffer.from(ciphertext,"base64url"); if(raw.length<29) throw new Error("FORTRESS_CIPHERTEXT_INVALID");
  const decipher=createDecipheriv("aes-256-gcm",key,raw.subarray(0,12)); decipher.setAuthTag(raw.subarray(12,28));
  return Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]);
 } finally { key.fill(0); }
}

export async function createVaultKeyMaterial(provider:FortressKeyProvider,vaultId:string,keyRef:string):Promise<VaultKeyMaterial>{
 const dek=randomBytes(32);
 const wrappedDek=await provider.wrapKey(vaultId,dek);
 dek.fill(0);
 return {vaultId,keyRef,wrappedDek};
}
