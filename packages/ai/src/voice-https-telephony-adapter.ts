import { randomUUID } from "node:crypto";
import { assertSecureOutboundUrl } from "../../api-gateway/src/secure-transport.js";
import { secureHttpsRequest } from "../../api-gateway/src/secure-http-client.js";
import type { VoiceTelephonyAdapter, VoiceProviderRequest, VoiceProviderResult, VoiceProviderCallback, VerifiedVoiceProviderEvent } from "./voice-provider-adapter.js";
import { verifyVoiceCallback } from "./voice-callback-security.js";
import { normalizeVoiceProviderEvent } from "./voice-provider-adapter.js";

export interface HttpsVoiceProviderConfig {
  readonly providerId: string;
  readonly organizationId: string;
  readonly endpoint: string;
  readonly callbackSecret: string;
  readonly allowedHost: string;
  readonly ca: string | Buffer;
  readonly clientCertificate: string | Buffer;
  readonly clientKey: string | Buffer;
}

/**
 * Production provider client boundary. Vendor-specific payload mapping remains
 * outside the domain; this adapter owns transport, TLS/mTLS and response
 * normalization. Provider credentials/certificates are injected at runtime.
 */
export class HttpsVoiceTelephonyAdapter implements VoiceTelephonyAdapter {
  readonly protocol = "https-webhook" as const;
  readonly providerId: string;

  constructor(private readonly config: HttpsVoiceProviderConfig) {
    this.providerId = config.providerId;
    const endpoint = assertSecureOutboundUrl(config.endpoint, {
      allowedHosts: [config.allowedHost.toLowerCase()],
      allowPrivateIpLiterals: false,
    });
    if (endpoint.hostname.toLowerCase() !== config.allowedHost.toLowerCase()) throw new Error("VOICE_PROVIDER_HOST_MISMATCH");
    if (!config.ca || !config.clientCertificate || !config.clientKey) throw new Error("VOICE_MTLS_MATERIAL_REQUIRED");
  }

  async placeCall(request: VoiceProviderRequest): Promise<VoiceProviderResult> {
    if (request.organizationId !== this.config.organizationId) throw new Error("VOICE_PROVIDER_TENANT_MISMATCH");
    const correlationId = request.correlationId || randomUUID();
    const response = await secureHttpsRequest({
      endpoint: new URL(this.config.endpoint),
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        "idempotency-key": request.idempotencyKey,
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify({
        destination: request.destination,
        purpose: request.purpose,
        expires_at: request.expiresAt,
        correlation_id: correlationId,
      }),
      ca: this.config.ca,
      cert: this.config.clientCertificate,
      key: this.config.clientKey,
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return { providerId: this.providerId, providerCallId: "", accepted: false, status: "rejected", correlationId };
    }
    let parsed: { call_id?: string; status?: "accepted"|"pending"|"rejected" };
    try { parsed = JSON.parse(response.body) as typeof parsed; } catch { throw new Error("VOICE_PROVIDER_RESPONSE_INVALID_JSON"); }
    if (!parsed.call_id || !parsed.status) throw new Error("VOICE_PROVIDER_RESPONSE_SCHEMA_INVALID");
    return {
      providerId: this.providerId,
      providerCallId: parsed.call_id,
      accepted: parsed.status === "accepted",
      status: parsed.status,
      correlationId,
    };
  }

  async verifyCallback(callback: VoiceProviderCallback): Promise<VerifiedVoiceProviderEvent> {
    if (callback.providerId !== this.providerId || callback.organizationId !== this.config.organizationId) {
      throw new Error("VOICE_PROVIDER_CALLBACK_TENANT_MISMATCH");
    }
    const timestamp = extractTimestamp(callback);
    verifyVoiceCallback({
      policy: { secret: this.config.callbackSecret, maxAgeSeconds: 300 },
      timestamp,
      signature: callback.signature,
      rawBody: callback.rawBody,
    });
    return normalizeVoiceProviderEvent({
      providerId: callback.providerId,
      organizationId: callback.organizationId,
      eventId: callback.eventId,
      eventType: "provider.callback",
      providerCallId: callback.eventId,
      occurredAt: new Date(Number(timestamp) * 1000).toISOString(),
      rawBody: callback.rawBody,
    });
  }

  async terminateCall(providerCallId: string, correlationId: string): Promise<void> {
    if (!providerCallId || !correlationId) throw new Error("VOICE_PROVIDER_TERMINATION_CONTEXT_REQUIRED");
    await secureHttpsRequest({
      endpoint: new URL(this.config.endpoint + "/" + encodeURIComponent(providerCallId)),
      method: "DELETE",
      headers: { "accept": "application/json", "x-correlation-id": correlationId },
      ca: this.config.ca,
      cert: this.config.clientCertificate,
      key: this.config.clientKey,
    });
  }
}

function extractTimestamp(callback: VoiceProviderCallback): string {
  const match = callback.rawBody.match(/"timestamp"\s*:\s*"?(\d{10,20})"?/);
  if (!match?.[1]) throw new Error("VOICE_PROVIDER_CALLBACK_TIMESTAMP_REQUIRED");
  return match[1];
}
