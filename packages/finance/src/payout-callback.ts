import { createHmac, timingSafeEqual } from "node:crypto";

export type PayoutCallbackState = "accepted" | "duplicate" | "rejected" | "quarantined";

export interface PayoutCallbackPayload {
  organizationId: string;
  payoutId: string;
  provider: string;
  providerEventId: string;
  providerReference: string;
  amountMinor: bigint;
  currency: string;
  status: "confirmed" | "failed";
  occurredAt: string;
}

export interface PayoutCallbackEnvelope {
  rawBody: string;
  signature: string;
  receivedAt: string;
  maxAgeSeconds: number;
  secret: string;
}

export function verifyPayoutCallbackSignature(envelope: PayoutCallbackEnvelope): boolean {
  const expected = createHmac("sha256", envelope.secret).update(envelope.rawBody, "utf8").digest("hex");
  const provided = envelope.signature.replace(/^sha256=/, "").trim();
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isPayoutCallbackFresh(receivedAt: string, occurredAt: string, maxAgeSeconds: number, now = Date.now()): boolean {
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) throw new Error("PAYOUT_CALLBACK_MAX_AGE_INVALID");
  const received = Date.parse(receivedAt);
  const occurred = Date.parse(occurredAt);
  if (!Number.isFinite(received) || !Number.isFinite(occurred)) return false;
  const age = Math.abs(now - occurred);
  const receiveSkew = Math.abs(now - received);
  return age <= maxAgeSeconds * 1000 && receiveSkew <= maxAgeSeconds * 1000;
}

export function parsePayoutCallback(rawBody: string): PayoutCallbackPayload {
  const value: unknown = JSON.parse(rawBody);
  if (!value || typeof value !== "object") throw new Error("PAYOUT_CALLBACK_PAYLOAD_INVALID");
  const v = value as Record<string, unknown>;
  const required = ["organizationId","payoutId","provider","providerEventId","providerReference","amountMinor","currency","status","occurredAt"];
  for (const key of required) if (typeof v[key] !== "string" || !v[key]) throw new Error("PAYOUT_CALLBACK_FIELD_INVALID");
  if (!/^[0-9]+$/.test(v.amountMinor as string)) throw new Error("PAYOUT_CALLBACK_AMOUNT_INVALID");
  if (!/^[A-Z]{3}$/.test(v.currency as string)) throw new Error("PAYOUT_CALLBACK_CURRENCY_INVALID");
  if (v.status !== "confirmed" && v.status !== "failed") throw new Error("PAYOUT_CALLBACK_STATUS_INVALID");
  return {
    organizationId: v.organizationId as string,
    payoutId: v.payoutId as string,
    provider: v.provider as string,
    providerEventId: v.providerEventId as string,
    providerReference: v.providerReference as string,
    amountMinor: BigInt(v.amountMinor as string),
    currency: v.currency as string,
    status: v.status as "confirmed" | "failed",
    occurredAt: v.occurredAt as string
  };
}

export function classifyPayoutCallback(
  expected: { organizationId: string; payoutId: string; provider: string; amountMinor: bigint; currency: string; providerReference: string },
  actual: PayoutCallbackPayload
): "accepted" | "quarantined" {
  if (actual.organizationId !== expected.organizationId || actual.payoutId !== expected.payoutId) return "quarantined";
  if (actual.provider !== expected.provider || actual.providerReference !== expected.providerReference) return "quarantined";
  if (actual.amountMinor !== expected.amountMinor || actual.currency !== expected.currency) return "quarantined";
  return "accepted";
}
