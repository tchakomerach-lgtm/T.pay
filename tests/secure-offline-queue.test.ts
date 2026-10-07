import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, generateKeyPairSync } from "node:crypto";
import { SecureOfflineQueue, type SecureOfflineEnvelope, type SecureOfflineStorage, type DeviceKeyProvider } from "../packages/education/src/secure-offline-queue.js";

class MemoryStorage implements SecureOfflineStorage{
  records:SecureOfflineEnvelope[]=[]; quarantined:string[]=[];
  async getLastSequence(){return this.records.filter(r=>r.state==="QUEUED").reduce((m,r)=>r.sequence>m?r.sequence:m,0n);}
  async append(record:SecureOfflineEnvelope,expected:number|bigint){const last=await this.getLastSequence();if(last!==BigInt(expected))throw new Error("OFFLINE_STORAGE_CONCURRENCY");this.records.push(record);}
  async list(deviceId:string){return this.records.filter(r=>r.deviceId===deviceId);}
  async quarantine(record:SecureOfflineEnvelope,reason:string){record.state="QUARANTINED";this.quarantined.push(reason);}
  async remove(eventId:string){this.records=this.records.filter(r=>r.eventId!==eventId);}
}
const scope={deviceId:"device-1",tenantId:"tenant-1",organizationId:"org-1"};
const keys=generateKeyPairSync("ed25519");
const provider:DeviceKeyProvider={getEncryptionKey:async()=>new Uint8Array(randomBytes(32)),getSigningKeys:async()=>keys};


test("P044 encrypts, signs and anti-rolls back offline envelopes",async()=>{
  const storage=new MemoryStorage();
  const fixedKey=new Uint8Array(randomBytes(32));
  const stableProvider:DeviceKeyProvider={getEncryptionKey:async()=>fixedKey,getSigningKeys:async()=>keys};
  const queue=new SecureOfflineQueue(storage,stableProvider);
  const first=await queue.append(scope,{eventId:"evt-1",sequence:1n,occurredAt:"2026-10-07T13:00:00.000Z",payload:{status:"PRESENT",studentId:"s1"}});
  await queue.append(scope,{eventId:"evt-2",sequence:2n,occurredAt:"2026-10-07T13:01:00.000Z",payload:{status:"LATE",studentId:"s2"}});
  assert.notEqual(first.ciphertext,JSON.stringify({status:"PRESENT",studentId:"s1"}));
  const restored=await queue.read(scope);
  assert.deepEqual(restored.map(x=>x.payload),[{status:"PRESENT",studentId:"s1"},{status:"LATE",studentId:"s2"}]);
  await assert.rejects(queue.append(scope,{eventId:"evt-replay",sequence:2n,occurredAt:"2026-10-07T13:02:00.000Z",payload:{status:"ABSENT"}}),/OFFLINE_ROLLBACK_OR_REPLAY/);
});

test("P044 quarantines tampered offline envelopes",async()=>{
  const storage=new MemoryStorage();
  const fixedKey=new Uint8Array(randomBytes(32));
  const queue=new SecureOfflineQueue(storage,{getEncryptionKey:async()=>fixedKey,getSigningKeys:async()=>keys});
  await queue.append(scope,{eventId:"evt-tamper",sequence:1n,occurredAt:"2026-10-07T13:00:00.000Z",payload:{value:"secret"}});
  storage.records[0]!.ciphertext=Buffer.from("tampered").toString("base64");
  await assert.rejects(queue.read(scope),/OFFLINE_SIGNATURE_INVALID/);
  assert.equal(storage.records[0]!.state,"QUARANTINED");
  assert.equal(storage.quarantined[0],"OFFLINE_SIGNATURE_INVALID");
});
