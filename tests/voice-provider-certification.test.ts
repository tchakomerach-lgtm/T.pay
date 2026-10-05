import test from "node:test";
import assert from "node:assert/strict";
import type { VoiceTelephonyAdapter, VoiceProviderRequest } from "../packages/ai/src/voice-provider-adapter.js";
import { certifyVoiceProviderSandbox } from "../packages/ai/src/voice-provider-certification.js";

test("provider sandbox certification requires correlation and provider call identity", async () => {
  const request: VoiceProviderRequest = {
    organizationId: "org-a", callId: "call-a", correlationId: "corr-a",
    idempotencyKey: "idem-a-123456789", destination: "+22800000000",
    purpose: "sandbox", expiresAt: "2026-10-05T15:00:00Z",
  };
  const adapter: VoiceTelephonyAdapter = {
    providerId: "sandbox-provider",
    protocol: "https-webhook",
    async placeCall(r) { return { providerId: "sandbox-provider", providerCallId: r.callId, accepted: true, status: "accepted", correlationId: r.correlationId }; },
    async verifyCallback() { throw new Error("not used"); },
    async terminateCall() {},
  };
  const result = await certifyVoiceProviderSandbox(adapter, request);
  assert.equal(result.passed, true);
  assert.deepEqual(result.failures, []);
});
