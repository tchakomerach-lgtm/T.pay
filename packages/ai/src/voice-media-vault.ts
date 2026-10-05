export type VoiceMediaType = "audio" | "transcript" | "transcript_redacted";
export type VoiceMediaState = "ACTIVE" | "REDACTED" | "QUARANTINED" | "PENDING_ERASURE" | "ERASED";

export interface VoiceMediaRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly callId: string;
  readonly mediaType: VoiceMediaType;
  readonly objectUri: string;
  readonly contentSha256: string;
  readonly encryptionKeyRef: string;
  readonly encryptionMode: "KMS_ENVELOPE" | "HSM_ENVELOPE";
  readonly consentId?: string;
  readonly retentionUntil?: string;
  readonly legalHold: boolean;
  readonly state: VoiceMediaState;
}

export interface VoiceMediaVaultStore {
  create(record: VoiceMediaRecord): Promise<void>;
  markPendingErasure(organizationId: string, now: string): Promise<number>;
  erase(recordId: string, erasedAt: string): Promise<void>;
}

export function validateVoiceMediaRecord(record: VoiceMediaRecord): void {
  if (!record.organizationId || !record.callId || !record.objectUri) throw new Error("VOICE_MEDIA_IDENTITY_REQUIRED");
  if (!/^[a-f0-9]{64}$/.test(record.contentSha256)) throw new Error("VOICE_MEDIA_HASH_INVALID");
  if (!record.encryptionKeyRef) throw new Error("VOICE_MEDIA_KEY_REF_REQUIRED");
  if (!record.legalHold && record.retentionUntil === undefined) throw new Error("VOICE_MEDIA_RETENTION_REQUIRED");
  if (record.state === "ERASED" && !record.legalHold) return;
  if (/^https?:\/\//i.test(record.objectUri)) throw new Error("VOICE_MEDIA_DIRECT_HTTP_URI_FORBIDDEN");
}

export async function runVoiceRetentionSweep(store: VoiceMediaVaultStore, organizationId: string, now: string): Promise<number> {
  if (!organizationId) throw new Error("VOICE_MEDIA_ORGANIZATION_REQUIRED");
  return store.markPendingErasure(organizationId, now);
}
