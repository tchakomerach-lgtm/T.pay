import { createCipheriv, createDecipheriv, createHash, randomBytes, sign, verify, type KeyObject } from "node:crypto";

export type OfflineEnvelopeState = "QUEUED"|"QUARANTINED";
export type OfflinePayload = Record<string,unknown>;

export interface SecureOfflineEnvelope {
  deviceId:string; tenantId:string; organizationId:string; eventId:string; sequence:bigint;
  occurredAt:string; state:OfflineEnvelopeState; iv:string; ciphertext:string; tag:string; aad:string; signature:string;
}

export interface SecureOfflineStorage {
  getLastSequence(scope:{deviceId:string;tenantId:string;organizationId:string}):Promise<bigint>;
  append(record:SecureOfflineEnvelope,expectedPreviousSequence:bigint):Promise<void>;
  list(deviceId:string):Promise<SecureOfflineEnvelope[]>;
  quarantine(record:SecureOfflineEnvelope,reason:string):Promise<void>;
  remove(eventId:string):Promise<void>;
}
export interface DeviceKeyProvider {
  getEncryptionKey(scope:{deviceId:string;tenantId:string;organizationId:string}):Promise<Uint8Array>;
  getSigningKeys(scope:{deviceId:string;tenantId:string;organizationId:string}):Promise<{privateKey:KeyObject;publicKey:KeyObject}>;
}

function canonical(value:unknown):string{
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  const record=value as Record<string,unknown>;
  return "{"+Object.keys(record).sort().map(k=>JSON.stringify(k)+":"+canonical(record[k])).join(",")+"}";
}
function aadFor(scope:{deviceId:string;tenantId:string;organizationId:string},sequence:bigint):string{
  return canonical({...scope,sequence:sequence.toString()});
}
function assertKey(key:Uint8Array):void{if(key.byteLength!==32)throw new Error("OFFLINE_AES256_KEY_REQUIRED");}
function assertScope(scope:{deviceId:string;tenantId:string;organizationId:string}):void{
  if(!scope.deviceId||!scope.tenantId||!scope.organizationId)throw new Error("OFFLINE_SCOPE_REQUIRED");
}

export class SecureOfflineQueue{
  constructor(private readonly storage:SecureOfflineStorage,private readonly keys:DeviceKeyProvider){}
  async append(scope:{deviceId:string;tenantId:string;organizationId:string},event:{eventId:string;sequence:bigint;occurredAt:string;payload:OfflinePayload}):Promise<SecureOfflineEnvelope>{
    assertScope(scope);
    if(event.sequence<1n)throw new Error("OFFLINE_SEQUENCE_INVALID");
    if(!event.eventId||!Number.isFinite(Date.parse(event.occurredAt)))throw new Error("OFFLINE_EVENT_INVALID");
    const previous=await this.storage.getLastSequence(scope);
    if(event.sequence<=previous)throw new Error("OFFLINE_ROLLBACK_OR_REPLAY");
    const key=await this.keys.getEncryptionKey(scope);assertKey(key);
    const signing=await this.keys.getSigningKeys(scope);
    const aad=aadFor(scope,event.sequence);
    const iv=randomBytes(12);
    const cipher=createCipheriv("aes-256-gcm",Buffer.from(key),iv);
    cipher.setAAD(Buffer.from(aad));
    const plaintext=Buffer.from(canonical(event.payload));
    const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
    const tag=cipher.getAuthTag();
    const unsigned={deviceId:scope.deviceId,tenantId:scope.tenantId,organizationId:scope.organizationId,eventId:event.eventId,sequence:event.sequence.toString(),occurredAt:event.occurredAt,state:"QUEUED",iv:iv.toString("base64"),ciphertext:ciphertext.toString("base64"),tag:tag.toString("base64"),aad};
    const signature=sign(null,Buffer.from(canonical(unsigned)),signing.privateKey).toString("base64");
    const record={...unsigned,signature,sequence:event.sequence} as SecureOfflineEnvelope;
    await this.storage.append(record,previous);
    return record;
  }

  async read(scope:{deviceId:string;tenantId:string;organizationId:string}):Promise<Array<{record:SecureOfflineEnvelope;payload:OfflinePayload}>>{
    assertScope(scope);
    const key=await this.keys.getEncryptionKey(scope);assertKey(key);
    const signing=await this.keys.getSigningKeys(scope);
    const records=(await this.storage.list(scope.deviceId)).sort((a,b)=>a.sequence<b.sequence?-1:a.sequence>b.sequence?1:0);
    const out=[];
    let previous=0n;
    for(const record of records){
      try{
        if(record.deviceId!==scope.deviceId||record.tenantId!==scope.tenantId||record.organizationId!==scope.organizationId)throw new Error("OFFLINE_SCOPE_MISMATCH");
        if(record.sequence<=previous)throw new Error("OFFLINE_SEQUENCE_REPLAY");
        const unsigned={deviceId:record.deviceId,tenantId:record.tenantId,organizationId:record.organizationId,eventId:record.eventId,sequence:record.sequence.toString(),occurredAt:record.occurredAt,state:record.state,iv:record.iv,ciphertext:record.ciphertext,tag:record.tag,aad:record.aad};
        if(!verify(null,Buffer.from(canonical(unsigned)),signing.publicKey,Buffer.from(record.signature,"base64")))throw new Error("OFFLINE_SIGNATURE_INVALID");
        const expectedAad=aadFor(scope,record.sequence);if(record.aad!==expectedAad)throw new Error("OFFLINE_AAD_INVALID");
        const decipher=createDecipheriv("aes-256-gcm",Buffer.from(key),Buffer.from(record.iv,"base64"));
        decipher.setAAD(Buffer.from(record.aad));decipher.setAuthTag(Buffer.from(record.tag,"base64"));
        const plaintext=Buffer.concat([decipher.update(Buffer.from(record.ciphertext,"base64")),decipher.final()]);
        const payload=JSON.parse(plaintext.toString("utf8")) as OfflinePayload;
        out.push({record,payload});previous=record.sequence;
      }catch(error){
        await this.storage.quarantine(record,error instanceof Error?error.message:"OFFLINE_RECORD_INVALID");
        throw error;
      }
    }
    return out;
  }
}

export function deviceStorageFingerprint(scope:{deviceId:string;tenantId:string;organizationId:string}):string{
  return createHash("sha256").update(canonical(scope)).digest("hex");
}
