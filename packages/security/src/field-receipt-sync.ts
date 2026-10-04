import { createHash } from "node:crypto";
import type { FieldReceiptEvidence } from "./field-offline.js";

export type ReceiptSyncState="pending"|"verified"|"rejected"|"quarantined";
export interface ReceiptSyncRecord { receiptId:string; envelopeId:string; organizationId:string; deviceId:string; sequence:number; payloadHash:string; state:ReceiptSyncState; attempts:number; lastError?:string; updatedAt:string; }
export interface ReceiptSyncStore { get(receiptId:string):Promise<ReceiptSyncRecord|undefined>; put(record:ReceiptSyncRecord):Promise<void>; markVerified(receiptId:string):Promise<void>; markRejected(receiptId:string,reason:string):Promise<void>; quarantine(receiptId:string,reason:string):Promise<void>; }
export interface ReceiptVerificationTransport { verify(evidence:FieldReceiptEvidence):Promise<"verified"|"rejected"|"retry">; }

export function deterministicReceiptId(e:FieldReceiptEvidence):string {
  return createHash("sha256").update([e.organizationId,e.envelopeId,e.deviceId,e.sequence,e.payloadHash].join("|")).digest("hex");
}
export async function queueFieldReceipt(store:ReceiptSyncStore,e:FieldReceiptEvidence):Promise<ReceiptSyncRecord>{
  const expected=deterministicReceiptId(e);
  if(e.receiptId!==expected) throw new Error("FIELD_RECEIPT_ID_MISMATCH");
  const existing=await store.get(e.receiptId);
  if(existing) return existing;
  const record:ReceiptSyncRecord={receiptId:e.receiptId,envelopeId:e.envelopeId,organizationId:e.organizationId,deviceId:e.deviceId,sequence:e.sequence,payloadHash:e.payloadHash,state:"pending",attempts:0,updatedAt:new Date().toISOString()};
  await store.put(record); return record;
}
export async function recoverReceiptSync(store:ReceiptSyncStore,transport:ReceiptVerificationTransport,receiptId:string,maxAttempts=5):Promise<ReceiptSyncState>{
  const r=await store.get(receiptId); if(!r) throw new Error("FIELD_RECEIPT_NOT_FOUND");
  if(r.state==="verified"||r.state==="rejected"||r.state==="quarantined") return r.state;
  const result=await transport.verify({receiptId:r.receiptId,envelopeId:r.envelopeId,organizationId:r.organizationId,deviceId:r.deviceId,sequence:r.sequence,payloadHash:r.payloadHash,issuedAt:r.updatedAt});
  if(result==="verified"){await store.markVerified(r.receiptId);return "verified";}
  if(result==="rejected"){await store.markRejected(r.receiptId,"SERVER_REJECTED");return "rejected";}
  if(r.attempts+1>=maxAttempts){await store.quarantine(r.receiptId,"MAX_ATTEMPTS");return "quarantined";}
  await store.put({...r,attempts:r.attempts+1,updatedAt:new Date().toISOString()}); return "pending";
}
