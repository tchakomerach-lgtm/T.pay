import type { VoiceTelephonyAdapter, VoiceProviderRequest } from "./voice-provider-adapter.js";

export interface VoiceProviderCertificationResult {
  readonly providerId: string;
  readonly passed: boolean;
  readonly checks: readonly string[];
  readonly failures: readonly string[];
}

export async function certifyVoiceProviderSandbox(
  adapter: VoiceTelephonyAdapter,
  request: VoiceProviderRequest,
): Promise<VoiceProviderCertificationResult> {
  const checks: string[] = [];
  const failures: string[] = [];
  if (adapter.protocol !== "https-webhook" && adapter.protocol !== "sip-tls" && adapter.protocol !== "webrtc-dtls-srtp") {
    failures.push("UNSUPPORTED_PROVIDER_PROTOCOL");
  } else checks.push("PROTOCOL_BOUNDARY");
  try {
    const result = await adapter.placeCall(request);
    if (!result.providerCallId) failures.push("PROVIDER_CALL_ID_MISSING");
    else checks.push("OUTBOUND_CORRELATION");
    if (result.correlationId !== request.correlationId) failures.push("CORRELATION_ID_MISMATCH");
    else checks.push("CORRELATION_BINDING");
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "PROVIDER_SANDBOX_CALL_FAILED");
  }
  return { providerId: adapter.providerId, passed: failures.length === 0, checks, failures };
}
