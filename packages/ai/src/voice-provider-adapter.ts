import { createHash } from "node:crypto";

export type VoiceProviderProtocol = "sip-tls" | "webrtc-dtls-srtp" | "https-webhook";

export interface VoiceProviderRequest {
  readonly organizationId: string;
  readonly callId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly destination: string;
  readonly purpose: string;
  readonly expiresAt: string;
}

export interface VoiceProviderResult {
  readonly providerId: string;
  readonly providerCallId: string;
  readonly accepted: boolean;
  readonly status: "accepted" | "rejected" | "pending";
  readonly correlationId: string;
}

export interface VoiceProviderCallback {
  readonly providerId: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly timestamp: string;
  readonly signature: string;
  readonly rawBody: string;
}

export interface VerifiedVoiceProviderEvent {
  readonly providerId: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly providerCallId: string;
  readonly occurredAt: string;
  readonly payloadHash: string;
}

export interface VoiceTelephonyAdapter {
  readonly providerId: string;
  readonly protocol: VoiceProviderProtocol;
  placeCall(request: VoiceProviderRequest): Promise<VoiceProviderResult>;
  verifyCallback(callback: VoiceProviderCallback): Promise<VerifiedVoiceProviderEvent>;
  terminateCall(providerCallId: string, correlationId: string): Promise<void>;
}

/**
 * Adapter boundary only. Provider credentials, SDKs and network clients stay outside
 * the domain. A provider cannot choose the T.Pay organization, permissions or action.
 */
export function normalizeVoiceProviderEvent(input: {
  providerId: string;
  organizationId: string;
  eventId: string;
  eventType: string;
  providerCallId: string;
  occurredAt: string;
  rawBody: string;
}): VerifiedVoiceProviderEvent {
  if (!input.providerId || !input.organizationId || !input.eventId || !input.providerCallId) {
    throw new Error("VOICE_PROVIDER_EVENT_IDENTITY_REQUIRED");
  }
  const t = Date.parse(input.occurredAt);
  if (!Number.isFinite(t)) throw new Error("VOICE_PROVIDER_EVENT_TIME_INVALID");
  if (Math.abs(Date.now() - t) > 5 * 60_000) throw new Error("VOICE_PROVIDER_EVENT_STALE");
  if (!input.eventType || input.eventType.length > 120) throw new Error("VOICE_PROVIDER_EVENT_TYPE_INVALID");
  return {
    providerId: input.providerId,
    organizationId: input.organizationId,
    eventId: input.eventId,
    eventType: input.eventType,
    providerCallId: input.providerCallId,
    occurredAt: new Date(t).toISOString(),
    payloadHash: createHash("sha256").update(input.rawBody, "utf8").digest("hex"),
  };
}
