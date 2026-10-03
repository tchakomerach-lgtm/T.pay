import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookEnvelope {
  provider: string;
  eventId: string;
  timestamp: number;
  signature: string;
  payload: string;
}

export interface WebhookReplayStore {
  seen(eventId: string): Promise<boolean>;
  mark(eventId: string): Promise<void>;
}

export function signWebhook(secret: string, timestamp: number, payload: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

export function verifyWebhookSignature(
  secret: string,
  envelope: WebhookEnvelope,
  maxAgeSeconds = 300,
  now = Math.floor(Date.now() / 1000)
): void {
  if (Math.abs(now - envelope.timestamp) > maxAgeSeconds) throw new Error("WEBHOOK_EXPIRED");
  const expected = signWebhook(secret, envelope.timestamp, envelope.payload);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(envelope.signature, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("WEBHOOK_SIGNATURE_INVALID");
}
