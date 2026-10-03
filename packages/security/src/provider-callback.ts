import { createHmac, timingSafeEqual } from "node:crypto";

export interface ProviderCallbackHeaders { providerId: string; eventId: string; timestamp: string; signature: string; }
export interface ProviderCallbackEnvelope { providerId: string; eventId: string; timestamp: number; signature: string; rawBody: string; }
export interface ProviderReplayGuard { claim(providerId: string, eventId: string): Promise<boolean>; }
export interface ProviderSecretResolver { resolve(providerId: string): Promise<string | null>; }
export interface VerifiedCallback { providerId: string; eventId: string; timestamp: number; rawBody: string; receivedAt: string; }

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const HEX_SIGNATURE = /^[a-f0-9]{64}$/i;

export function parseProviderCallback(headers: ProviderCallbackHeaders, rawBody: string, maxBodyBytes = 1024 * 1024): ProviderCallbackEnvelope {
  if (!headers.providerId || !ID_PATTERN.test(headers.providerId)) throw new Error("CALLBACK_PROVIDER_INVALID");
  if (!headers.eventId || !ID_PATTERN.test(headers.eventId)) throw new Error("CALLBACK_EVENT_ID_INVALID");
  if (!rawBody || Buffer.byteLength(rawBody, "utf8") > maxBodyBytes) throw new Error("CALLBACK_BODY_INVALID");
  const timestamp = Number(headers.timestamp);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw new Error("CALLBACK_TIMESTAMP_INVALID");
  if (!HEX_SIGNATURE.test(headers.signature)) throw new Error("CALLBACK_SIGNATURE_FORMAT_INVALID");
  return { providerId: headers.providerId, eventId: headers.eventId, timestamp, signature: headers.signature, rawBody };
}

export function verifyProviderCallbackSignature(secret: string, envelope: ProviderCallbackEnvelope, maxAgeSeconds = 300, now = Math.floor(Date.now() / 1000)): void {
  if (!secret) throw new Error("CALLBACK_SECRET_MISSING");
  if (Math.abs(now - envelope.timestamp) > maxAgeSeconds) throw new Error("CALLBACK_EXPIRED");
  const expected = createHmac("sha256", secret).update(`${envelope.timestamp}.${envelope.rawBody}`, "utf8").digest("hex");
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(envelope.signature, "utf8");
  if (expectedBytes.length !== actualBytes.length || !timingSafeEqual(expectedBytes, actualBytes)) throw new Error("CALLBACK_SIGNATURE_INVALID");
}

export async function verifyAndClaimProviderCallback(envelope: ProviderCallbackEnvelope, secrets: ProviderSecretResolver, replay: ProviderReplayGuard, options: { maxAgeSeconds?: number; now?: number; receivedAt?: string } = {}): Promise<VerifiedCallback> {
  const secret = await secrets.resolve(envelope.providerId);
  if (!secret) throw new Error("CALLBACK_SECRET_NOT_CONFIGURED");
  verifyProviderCallbackSignature(secret, envelope, options.maxAgeSeconds ?? 300, options.now ?? Math.floor(Date.now() / 1000));
  const claimed = await replay.claim(envelope.providerId, envelope.eventId);
  if (!claimed) throw new Error("CALLBACK_REPLAY");
  return { providerId: envelope.providerId, eventId: envelope.eventId, timestamp: envelope.timestamp, rawBody: envelope.rawBody, receivedAt: options.receivedAt ?? new Date().toISOString() };
}
