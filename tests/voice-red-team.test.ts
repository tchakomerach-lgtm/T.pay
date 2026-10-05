import test from "node:test";
import assert from "node:assert/strict";
import { assertSecureOutboundUrl } from "../packages/api-gateway/src/secure-transport.js";
import { signVoiceCallback, verifyVoiceCallback } from "../packages/ai/src/voice-callback-security.js";
import { HttpsVoiceTelephonyAdapter } from "../packages/ai/src/voice-https-telephony-adapter.js";

test("red team: SSRF and cleartext downgrade are rejected", () => {
  assert.throws(() => assertSecureOutboundUrl("http://169.254.169.254/latest/meta-data", { allowedHosts: ["169.254.169.254"], allowPrivateIpLiterals: false }), /HTTPS_REQUIRED/);
  assert.throws(() => assertSecureOutboundUrl("https://127.0.0.1/internal", { allowedHosts: ["127.0.0.1"], allowPrivateIpLiterals: false }), /PRIVATE_IP/);
  assert.throws(() => assertSecureOutboundUrl("https://evil.example/callback", { allowedHosts: ["trusted.example"], allowPrivateIpLiterals: false }), /NOT_ALLOWLISTED/);
});

test("red team: callback body tampering and stale replay are rejected", () => {
  const rawBody = '{"timestamp":"1791208800","event":"call.completed"}';
  const signature = signVoiceCallback({ secret: "red-team-secret", timestamp: "1791208800", rawBody });
  assert.throws(() => verifyVoiceCallback({
    policy: { secret: "red-team-secret", maxAgeSeconds: 300 },
    timestamp: "1791208800",
    signature,
    rawBody: '{"timestamp":"1791208800","event":"call.completed","org":"victim"}',
    now: new Date("2026-10-05T14:00:00Z"),
  }), /SIGNATURE_MISMATCH/);
  assert.throws(() => verifyVoiceCallback({
    policy: { secret: "red-team-secret", maxAgeSeconds: 10 },
    timestamp: "1",
    signature,
    rawBody,
    now: new Date("2026-10-05T14:00:00Z"),
  }), /STALE/);
});

test("red team: provider adapter refuses cross-tenant construction and missing mTLS material", () => {
  assert.throws(() => new HttpsVoiceTelephonyAdapter({
    providerId: "provider-a",
    organizationId: "org-a",
    endpoint: "https://provider.example/voice",
    callbackSecret: "secret",
    allowedHost: "provider.example",
    ca: "",
    clientCertificate: "",
    clientKey: "",
  }), /MTLS_MATERIAL_REQUIRED/);
});

test("red team: provider callback cannot be accepted for another tenant", async () => {
  const adapter = new HttpsVoiceTelephonyAdapter({
    providerId: "provider-a",
    organizationId: "org-a",
    endpoint: "https://provider.example/voice",
    callbackSecret: "secret",
    allowedHost: "provider.example",
    ca: "CA",
    clientCertificate: "CERT",
    clientKey: "KEY",
  });
  const rawBody = '{"timestamp":"1791208800"}';
  const signature = signVoiceCallback({ secret: "secret", timestamp: "1791208800", rawBody });
  await assert.rejects(adapter.verifyCallback({
    providerId: "provider-a",
    organizationId: "org-b",
    eventId: "evt",
    timestamp: "2026-10-05T14:00:00Z",
    signature,
    rawBody,
  }), /TENANT_MISMATCH/);
});
