import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { OfflineEnvelope } from "./field-offline.js";

export interface QueueKeyProvider { getKey(keyId: string): Promise<Buffer>; }
export interface EncryptedQueueRecord { envelopeId:string; keyId:string; nonceB64:string; ciphertextB64:string; authTagB64:string; createdAt:string; attempts:number; nextAttemptAt:string; }
export interface EncryptedQueueStore { put(record:EncryptedQueueRecord):Promise<void>; listReady(now:Date,limit:number):Promise<readonly EncryptedQueueRecord[]>; markAttempt(envelopeId:string,nextAttemptAt:Date):Promise<void>; remove(envelopeId:string):Promise<void>; quarantine(envelopeId:string,reason:string):Promise<void>; }
export interface OfflineSyncTransport { submit(envelope:OfflineEnvelope):Promise<"accepted"|"duplicate"|"rejected"|"retry">; }

function keyMaterial(key:Buffer):Buffer {
  if(key.length===32)return key;
  return createHash("sha256").update(key).digest();
}
function aad(envelopeId:string,keyId:string):Buffer { return Buffer.from(`tpay-offline-queue.v1.${envelopeId}.${keyId}`,"utf8"); }

export async function encryptQueueEnvelope(e:OfflineEnvelope,keyId:string,key:Buffer):Promise<EncryptedQueueRecord>{
  if(!keyId || key.length<16) throw new Error("OFFLINE_QUEUE_KEY_INVALID");
  const nonce=randomBytes(12), cipher=createCipheriv("aes-256-gcm",keyMaterial(key),nonce);
  cipher.setAAD(aad(e.envelopeId,keyId));
  const plaintext=Buffer.from(JSON.stringify(e),"utf8");
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return {envelopeId:e.envelopeId,keyId,nonceB64:nonce.toString("base64"),ciphertextB64:ciphertext.toString("base64"),authTagB64:cipher.getAuthTag().toString("base64"),createdAt:new Date().toISOString(),attempts:0,nextAttemptAt:new Date(0).toISOString()};
}
export async function decryptQueueEnvelope(r:EncryptedQueueRecord,key:Buffer):Promise<OfflineEnvelope>{
  try{
    const decipher=createDecipheriv("aes-256-gcm",keyMaterial(key),Buffer.from(r.nonceB64,"base64"));
    decipher.setAAD(aad(r.envelopeId,r.keyId)); decipher.setAuthTag(Buffer.from(r.authTagB64,"base64"));
    const plain=Buffer.concat([decipher.update(Buffer.from(r.ciphertextB64,"base64")),decipher.final()]);
    const e=JSON.parse(plain.toString("utf8")) as OfflineEnvelope;
    if(e.envelopeId!==r.envelopeId)throw new Error("OFFLINE_QUEUE_ID_MISMATCH");
    return e;
  }catch{ throw new Error("OFFLINE_QUEUE_AUTH_FAILED"); }
}

export class BoundedOfflineSyncWorker {
  constructor(private readonly store:EncryptedQueueStore,private readonly keys:QueueKeyProvider,private readonly transport:OfflineSyncTransport,private readonly maxAttempts=8,private readonly maxBatch=25){}
  async enqueue(e:OfflineEnvelope,keyId:string,key:Buffer):Promise<void>{
    const r=await encryptQueueEnvelope(e,keyId,key); await this.store.put(r);
  }
  async drain(now=new Date()):Promise<{accepted:number;duplicate:number;rejected:number;retry:number}>{
    const out={accepted:0,duplicate:0,rejected:0,retry:0};
    const rows=await this.store.listReady(now,this.maxBatch);
    for(const row of rows){
      try{
        const e=await decryptQueueEnvelope(row,await this.keys.getKey(row.keyId));
        const result=await this.transport.submit(e);
        if(result==="accepted"||result==="duplicate"){out[result]++;await this.store.remove(row.envelopeId);}
        else if(result==="rejected"){out.rejected++;await this.store.quarantine(row.envelopeId,"SERVER_REJECTED");}
        else {
          out.retry++;
          if(row.attempts+1>=this.maxAttempts) await this.store.quarantine(row.envelopeId,"MAX_ATTEMPTS");
          else {
            const delay=Math.min(3600_000,2**Math.min(row.attempts,10)*1000);
            await this.store.markAttempt(row.envelopeId,new Date(now.getTime()+delay));
          }
        }
      }catch{
        out.retry++;
        if(row.attempts+1>=this.maxAttempts) await this.store.quarantine(row.envelopeId,"MAX_ATTEMPTS");
        else await this.store.markAttempt(row.envelopeId,new Date(now.getTime()+Math.min(3600_000,2**Math.min(row.attempts,10)*1000)));
      }
    }
    return out;
  }
}
