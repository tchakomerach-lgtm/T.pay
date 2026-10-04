import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  acceptOfflineEnvelope, assertOfflineEnvelopeFresh, buildFieldReceiptEvidence,
  classifySyncConflict, hashOfflinePayload, verifyOfflineEnvelopeSignature, type DeviceBinding
} from "../packages/security/src/field-offline.js";

function makeEnvelope(privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"], overrides: Partial<any> = {}) {
  const base = {
    envelopeId:"env-001", organizationId:"org-001", deviceId:"dev-001", keyId:"key-001", sequence:1,
    issuedAt:new Date(Date.now()-10*60_000).toISOString(), expiresAt:new Date(Date.now()+40*60_000).toISOString(),
    idempotencyKey:"offline-idempotency-001", nonceB64:Buffer.from("nonce").toString("base64"),
    ciphertextB64:Buffer.from("encrypted-field-payload").toString("base64"), algorithm:"ed25519" as const
  };
  const e={...base,...overrides};
  const canonical=[e.envelopeId,e.organizationId,e.deviceId,e.keyId,e.sequence,e.issuedAt,e.expiresAt,e.idempotencyKey,e.nonceB64,e.ciphertextB64,e.algorithm].join(".");
  return {...e,signatureB64:sign(null,Buffer.from(canonical),privateKey).toString("base64")};
}
const keys=generateKeyPairSync("ed25519");
const publicKeyPem=keys.publicKey.export({type:"spki",format:"pem"}).toString();

test("L6 accepts a valid signed envelope exactly once", async()=>{
  const e=makeEnvelope(keys.privateKey);
  const device:DeviceBinding={deviceId:"dev-001",organizationId:"org-001",keyId:"key-001",publicKeyPem,status:"active",maxOfflineSeconds:3600,lastAcceptedSequence:0};
  const claimed=new Set<string>();
  let sequence=0;
  const replayStore={claim:async(id:string)=>{if(claimed.has(id))return false;claimed.add(id);return true;}};
  const deviceStore={get:async()=>device,advanceSequence:async(_o:string,_d:string,s:number)=>{if(s<=sequence)return false;sequence=s;return true;}};
  assert.equal(await acceptOfflineEnvelope(e,"org-001",replayStore,deviceStore,Date.parse(e.issuedAt)+10_000),"accepted");
  await assert.rejects(()=>acceptOfflineEnvelope(e,"org-001",replayStore,deviceStore,Date.parse(e.issuedAt)+20_000),/OFFLINE_ENVELOPE_REPLAY/);
});
test("L6 rejects cross-organization, revoked-device, gap and tampered envelopes", async()=>{
  const e=makeEnvelope(keys.privateKey);
  const device:DeviceBinding={deviceId:"dev-001",organizationId:"org-001",keyId:"key-001",publicKeyPem,status:"active",maxOfflineSeconds:3600,lastAcceptedSequence:0};
  const stores={claim:async()=>true,get:async()=>device,advanceSequence:async()=>true};
  await assert.rejects(()=>acceptOfflineEnvelope(e,"org-002",stores,stores),/OFFLINE_ORGANIZATION_MISMATCH/);
  await assert.rejects(()=>acceptOfflineEnvelope({...e,ciphertextB64:Buffer.from("tampered").toString("base64")},"org-001",stores,stores),/OFFLINE_SIGNATURE_INVALID/);
  await assert.rejects(()=>acceptOfflineEnvelope(makeEnvelope(keys.privateKey,{sequence:2}),"org-001",stores,stores),/OFFLINE_SEQUENCE_GAP/);
  const revoked={...device,status:"revoked" as const};
  await assert.rejects(()=>acceptOfflineEnvelope(e,"org-001",stores,{...stores,get:async()=>revoked}),/OFFLINE_DEVICE_REVOKED_OR_UNKNOWN/);
});
test("L6 enforces freshness and records privacy-minimized receipt evidence",async()=>{
  const e=makeEnvelope(keys.privateKey);
  assert.doesNotThrow(()=>assertOfflineEnvelopeFresh(e,Date.parse(e.issuedAt)+10_000,120_000,3600));
  assert.throws(
    ()=>assertOfflineEnvelopeFresh(
      {...e,issuedAt:"2026-01-01T00:00:00.000Z",expiresAt:"2026-01-01T00:50:00.000Z"},
      Date.parse("2026-01-01T00:00:10.000Z"),120_000,60
    ),
    /OFFLINE_ENVELOPE_DURATION_EXCEEDED/
  );
  assert.throws(()=>assertOfflineEnvelopeFresh(e,Date.parse(e.expiresAt)+1),/OFFLINE_ENVELOPE_EXPIRED/);
  assert.equal(verifyOfflineEnvelopeSignature(e,publicKeyPem),true);
  const evidence=buildFieldReceiptEvidence(e,"receipt-001");
  assert.equal(evidence.payloadHash,hashOfflinePayload(e.ciphertextB64));
  assert.equal((evidence as any).payload,undefined);
});
test("L6 classifies recoverable synchronization conflicts without mutating financial state",()=>{
  const e=makeEnvelope(keys.privateKey);
  const device:DeviceBinding={deviceId:"dev-001",organizationId:"org-001",keyId:"key-001",publicKeyPem,status:"active",maxOfflineSeconds:3600,lastAcceptedSequence:1};
  assert.deepEqual(classifySyncConflict(e,device,false),{envelopeId:"env-001",kind:"sequence_rewind",recoverable:true});
  assert.deepEqual(classifySyncConflict({...e,sequence:3},device,false),{envelopeId:"env-001",kind:"sequence_gap",recoverable:true});
  assert.deepEqual(classifySyncConflict(e,device,true),{envelopeId:"env-001",kind:"duplicate",recoverable:true});
});
