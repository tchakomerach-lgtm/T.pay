import test from "node:test";
import assert from "node:assert/strict";
import { validateVoiceMediaRecord } from "../packages/ai/src/voice-media-vault.js";

const base = {
  id: "m1",
  organizationId: "org-a",
  callId: "call-a",
  mediaType: "transcript" as const,
  objectUri: "s3://encrypted-vault/org-a/call-a/t1",
  contentSha256: "a".repeat(64),
  encryptionKeyRef: "kms://key/tpay-voice",
  encryptionMode: "KMS_ENVELOPE" as const,
  legalHold: false,
  retentionUntil: "2027-01-01T00:00:00Z",
  state: "ACTIVE" as const,
};

test("voice media requires encryption metadata and retention", () => {
  assert.doesNotThrow(() => validateVoiceMediaRecord(base));
  assert.throws(() => validateVoiceMediaRecord({...base, encryptionKeyRef: ""}), /KEY_REF_REQUIRED/);
  assert.throws(() => validateVoiceMediaRecord({...base, retentionUntil: undefined}), /RETENTION_REQUIRED/);
  assert.throws(() => validateVoiceMediaRecord({...base, objectUri: "https://public.example/audio"}), /DIRECT_HTTP_URI_FORBIDDEN/);
});
