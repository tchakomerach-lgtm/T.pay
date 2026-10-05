import { createHmac, timingSafeEqual } from "node:crypto";

const HEX64 = /^[a-f0-9]{64}$/;

export interface SignedVoiceCallbackPolicy {
  readonly secret: string;
  readonly maxAgeSeconds: number;
}

export function signVoiceCallback(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
}): string {
  if (!input.secret) throw new Error("VOICE_CALLBACK_SECRET_REQUIRED");
  if (!/^[0-9]{10,20}$/.test(input.timestamp)) throw new Error("VOICE_CALLBACK_TIMESTAMP_INVALID");
  return createHmac("sha256", input.secret)
    .update(input.timestamp + "." + input.rawBody, "utf8")
    .digest("hex");
}

export function verifyVoiceCallback(input: {
  policy: SignedVoiceCallbackPolicy;
  timestamp: string;
  signature: string;
  rawBody: string;
  now?: Date;
}): void {
  const maxAge = input.policy.maxAgeSeconds;
  if (!Number.isInteger(maxAge) || maxAge < 1 || maxAge > 300) {
    throw new Error("VOICE_CALLBACK_MAX_AGE_INVALID");
  }
  const seconds = Number(input.timestamp);
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!Number.isSafeInteger(seconds) || Math.abs(now - seconds) > maxAge) {
    throw new Error("VOICE_CALLBACK_STALE");
  }
  if (!HEX64.test(input.signature)) throw new Error("VOICE_CALLBACK_SIGNATURE_INVALID");
  const expected = signVoiceCallback({
    secret: input.policy.secret,
    timestamp: input.timestamp,
    rawBody: input.rawBody,
  });
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(input.signature, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("VOICE_CALLBACK_SIGNATURE_MISMATCH");
  }
}
