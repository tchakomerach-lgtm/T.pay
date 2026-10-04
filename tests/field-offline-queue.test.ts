import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { decryptQueueEnvelope, encryptQueueEnvelope, BoundedOfflineSyncWorker, type EncryptedQueueRecord, type EncryptedQueueStore, type QueueKeyProvider } from "../packages/security/src/field-offline-queue.js";
import type { OfflineEnvelope } from "../packages/security/src/field-offline.js";

const e:OfflineEnvelope={envelopeId:"11111111-1111-4111-8111-111111111111",organizationId:"org-001",deviceId:"dev-001",keyId:"key-001",sequence:1,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),idempotencyKey:"offline-queue-idempotency-001",nonceB64:Buffer.from("n").toString("base64"),ciphertextB64:Buffer.from("encrypted").toString("base64"),signatureB64:"sig",algorithm:"ed25519"};
const key=Buffer.from("0123456789abcdef0123456789abcdef");

test("L6.3 encrypts queue records and authenticates tampering",async()=>{
 const r=await encryptQueueEnvelope(e,"key-001",key); assert.notEqual(r.ciphertextB64,Buffer.from(JSON.stringify(e)).toString("base64")); assert.deepEqual(await decryptQueueEnvelope(r,key),e);
 const tampered={...r,ciphertextB64:Buffer.from("tampered").toString("base64")}; await assert.rejects(()=>decryptQueueEnvelope(tampered,key),/OFFLINE_QUEUE_AUTH_FAILED/);
});
test("L6.3 rejects wrong queue key",async()=>{const r=await encryptQueueEnvelope(e,"key-001",key);await assert.rejects(()=>decryptQueueEnvelope(r,Buffer.from("different-key-material-123456")),/OFFLINE_QUEUE_AUTH_FAILED/);});
test("L6.3 sync worker is idempotent and bounded",async()=>{
 const rows=new Map<string,EncryptedQueueRecord>(); const store:EncryptedQueueStore={put:async r=>{if(rows.has(r.envelopeId))throw new Error("DUP");rows.set(r.envelopeId,r)},listReady:async()=>[...rows.values()],markAttempt:async(id,next)=>{const r=rows.get(id)!;rows.set(id,{...r,attempts:r.attempts+1,nextAttemptAt:next.toISOString()})},remove:async id=>{rows.delete(id)},quarantine:async id=>{rows.delete(id)}};
 const keys:QueueKeyProvider={getKey:async()=>key}; let calls=0; const worker=new BoundedOfflineSyncWorker(store,keys,{submit:async()=>{calls++;return calls===1?"retry":"accepted"}},3,25);
 await worker.enqueue(e,"key-001",key); const a=await worker.drain(new Date()); assert.equal(a.retry,1); assert.equal(rows.size,1); const b=await worker.drain(new Date(Date.now()+2000)); assert.equal(b.accepted,1); assert.equal(rows.size,0);
});
