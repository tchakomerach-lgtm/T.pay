import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";

export type OfflineEnvelopeStatus = "accepted" | "expired" | "replayed" | "device_mismatch" | "organization_mismatch" | "signature_invalid" | "sequence_conflict";

export interface OfflineEnvelope {
  envelopeId: string; organizationId: string; deviceId: string; keyId: string; sequence: number;
  issuedAt: string; expiresAt: string; idempotencyKey: string; nonceB64: string; ciphertextB64: string;
  signatureB64: string; algorithm: "ed25519";
}
export interface DeviceBinding {
  deviceId: string; organizationId: string; keyId: string; publicKeyPem: string;
  status: "active" | "revoked"; maxOfflineSeconds: number; lastAcceptedSequence: number;
}
export interface OfflineReplayStore { claim(envelopeId: string, organizationId: string, deviceId: string, sequence: number): Promise<boolean>; }
export interface DeviceBindingStore {
  get(organizationId: string, deviceId: string, keyId: string): Promise<DeviceBinding | undefined>;
  advanceSequence(organizationId: string, deviceId: string, sequence: number): Promise<boolean>;
}

export interface AtomicOfflineClaimStore extends OfflineReplayStore, DeviceBindingStore {
  claimAndAdvance(
    envelopeId: string,
    organizationId: string,
    deviceId: string,
    sequence: number
  ): Promise<boolean>;
}
export interface OfflineQueue {
  enqueue(envelope: OfflineEnvelope): Promise<void>;
  peek(limit: number): Promise<readonly OfflineEnvelope[]>;
  acknowledge(envelopeId: string): Promise<void>;
  reject(envelopeId: string, reason: OfflineEnvelopeStatus): Promise<void>;
}
export interface SyncConflict {
  envelopeId: string; kind: "duplicate" | "sequence_gap" | "sequence_rewind" | "expired" | "revoked_device" | "organization_mismatch";
  recoverable: boolean;
}
export interface FieldReceiptEvidence {
  receiptId: string; envelopeId: string; organizationId: string; deviceId: string; sequence: number; payloadHash: string; issuedAt: string;
}
function canonicalEnvelope(e: OfflineEnvelope): string {
  return [e.envelopeId,e.organizationId,e.deviceId,e.keyId,e.sequence,e.issuedAt,e.expiresAt,e.idempotencyKey,e.nonceB64,e.ciphertextB64,e.algorithm].join(".");
}
function decodeB64(value: string): Buffer { return Buffer.from(value, "base64"); }
export function hashOfflinePayload(ciphertextB64: string): string {
  return createHash("sha256").update(decodeB64(ciphertextB64)).digest("hex");
}
export function assertOfflineEnvelopeShape(e: OfflineEnvelope): void {
  if (!e.envelopeId || !e.organizationId || !e.deviceId || !e.keyId) throw new Error("OFFLINE_ENVELOPE_IDENTITY_REQUIRED");
  if (!Number.isSafeInteger(e.sequence) || e.sequence < 1) throw new Error("OFFLINE_SEQUENCE_INVALID");
  if (!/^.{16,128}$/.test(e.idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  const issued=Date.parse(e.issuedAt), expires=Date.parse(e.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued) throw new Error("OFFLINE_ENVELOPE_TIME_INVALID");
  if (e.algorithm !== "ed25519") throw new Error("OFFLINE_ALGORITHM_UNSUPPORTED");
}
export function verifyOfflineEnvelopeSignature(e: OfflineEnvelope, publicKeyPem: string): boolean {
  assertOfflineEnvelopeShape(e);
  return verifySignature(null,Buffer.from(canonicalEnvelope(e),"utf8"),createPublicKey(publicKeyPem),decodeB64(e.signatureB64));
}
export function assertOfflineEnvelopeFresh(
  e: OfflineEnvelope,
  now=Date.now(),
  maxClockSkewMs=120_000,
  maxOfflineSeconds?: number
): void {
  const issued=Date.parse(e.issuedAt), expires=Date.parse(e.expiresAt);
  if (issued > now + maxClockSkewMs) throw new Error("OFFLINE_ENVELOPE_FROM_FUTURE");
  if (expires < now - maxClockSkewMs) throw new Error("OFFLINE_ENVELOPE_EXPIRED");
  if (maxOfflineSeconds !== undefined) {
    if (!Number.isSafeInteger(maxOfflineSeconds) || maxOfflineSeconds < 60) {
      throw new Error("OFFLINE_MAX_DURATION_INVALID");
    }
    if (expires - issued > maxOfflineSeconds * 1000 + maxClockSkewMs) {
      throw new Error("OFFLINE_ENVELOPE_DURATION_EXCEEDED");
    }
    if (now - issued > maxOfflineSeconds * 1000 + maxClockSkewMs) {
      throw new Error("OFFLINE_ENVELOPE_TOO_OLD");
    }
  }
}
export async function acceptOfflineEnvelope(
  e: OfflineEnvelope, expectedOrganizationId: string, replayStore: OfflineReplayStore, deviceStore: DeviceBindingStore, now=Date.now()
): Promise<OfflineEnvelopeStatus> {
  assertOfflineEnvelopeShape(e);
  if (e.organizationId !== expectedOrganizationId) throw new Error("OFFLINE_ORGANIZATION_MISMATCH");
  const device=await deviceStore.get(e.organizationId,e.deviceId,e.keyId);
  if (!device || device.status !== "active") throw new Error("OFFLINE_DEVICE_REVOKED_OR_UNKNOWN");
  if (device.organizationId !== e.organizationId) throw new Error("OFFLINE_DEVICE_ORGANIZATION_MISMATCH");
  assertOfflineEnvelopeFresh(e,now,120_000,device.maxOfflineSeconds);
  if (!verifyOfflineEnvelopeSignature(e,device.publicKeyPem)) throw new Error("OFFLINE_SIGNATURE_INVALID");
  if (e.sequence <= device.lastAcceptedSequence) throw new Error("OFFLINE_SEQUENCE_REWIND");
  if (e.sequence > device.lastAcceptedSequence + 1) throw new Error("OFFLINE_SEQUENCE_GAP");
  if ("claimAndAdvance" in replayStore && typeof replayStore.claimAndAdvance === "function") {
    if (!(await replayStore.claimAndAdvance(e.envelopeId,e.organizationId,e.deviceId,e.sequence))) {
      throw new Error("OFFLINE_REPLAY_OR_SEQUENCE_CONFLICT");
    }
    return "accepted";
  }
  if (!(await replayStore.claim(e.envelopeId,e.organizationId,e.deviceId,e.sequence))) throw new Error("OFFLINE_ENVELOPE_REPLAY");
  if (!(await deviceStore.advanceSequence(e.organizationId,e.deviceId,e.sequence))) throw new Error("OFFLINE_SEQUENCE_CONFLICT");
  return "accepted";
}
export function classifySyncConflict(e: OfflineEnvelope, device: DeviceBinding|undefined, seenEnvelope: boolean, now=Date.now()): SyncConflict|undefined {
  if (seenEnvelope) return {envelopeId:e.envelopeId,kind:"duplicate",recoverable:true};
  if (!device || device.status!=="active") return {envelopeId:e.envelopeId,kind:"revoked_device",recoverable:false};
  if (device.organizationId!==e.organizationId) return {envelopeId:e.envelopeId,kind:"organization_mismatch",recoverable:false};
  if (Date.parse(e.expiresAt)<now) return {envelopeId:e.envelopeId,kind:"expired",recoverable:false};
  if (e.sequence<=device.lastAcceptedSequence) return {envelopeId:e.envelopeId,kind:"sequence_rewind",recoverable:true};
  if (e.sequence>device.lastAcceptedSequence+1) return {envelopeId:e.envelopeId,kind:"sequence_gap",recoverable:true};
  return undefined;
}
export function buildFieldReceiptEvidence(e: OfflineEnvelope, receiptId: string): FieldReceiptEvidence {
  return {receiptId,envelopeId:e.envelopeId,organizationId:e.organizationId,deviceId:e.deviceId,sequence:e.sequence,payloadHash:hashOfflinePayload(e.ciphertextB64),issuedAt:e.issuedAt};
}
