import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSecureOutboundUrl,
  assertSecureTransportPolicy,
  selectSecureProtocol,
} from "../packages/api-gateway/src/secure-transport.js";
import { signVoiceCallback, verifyVoiceCallback } from "../packages/ai/src/voice-callback-security.js";

test("primary outbound adapters require allowlisted HTTPS", () => {
  assert.throws(() => assertSecureOutboundUrl("http://provider.example/api", {
    allowedHosts: ["provider.example"],
    allowPrivateIpLiterals: false,
  }), /HTTPS_REQUIRED/);
  assert.throws(() => assertSecureOutboundUrl("https://10.0.0.4/api", {
    allowedHosts: ["10.0.0.4"],
    allowPrivateIpLiterals: false,
  }), /PRIVATE_IP/);
  assert.doesNotThrow(() => assertSecureOutboundUrl("https://provider.example/api", {
    allowedHosts: ["provider.example"],
    allowPrivateIpLiterals: false,
  }));
});

test("transport policy fails closed when TLS 1.3/HSTS invariants are weakened", () => {
  assert.doesNotThrow(() => assertSecureTransportPolicy({
    minimumTlsVersion: "TLSv1.3",
    allowTls12Compatibility: false,
    requireHsts: true,
    allowHttpRedirect: false,
    allowPrivateIpLiterals: false,
    allowedHosts: ["provider.example"],
    requireMutualTls: true,
    maxClockSkewSeconds: 120,
  }));
  assert.throws(() => assertSecureTransportPolicy({
    minimumTlsVersion: "TLSv1.3",
    allowTls12Compatibility: true,
    requireHsts: true,
    allowHttpRedirect: false,
    allowPrivateIpLiterals: false,
    allowedHosts: ["provider.example"],
    requireMutualTls: false,
    maxClockSkewSeconds: 120,
  }), /TLS12_NOT_ALLOWED/);
});

test("HTTP/3 fallback never downgrades to cleartext", () => {
  assert.equal(selectSecureProtocol("http3", true), "http3");
  assert.equal(selectSecureProtocol("http3", false), "https");
});

test("voice provider callback requires fresh HMAC over exact raw body", () => {
  const timestamp = "1791208800";
  const rawBody = '{"event_id":"evt-1"}';
  const signature = signVoiceCallback({ secret: "test-secret", timestamp, rawBody });
  assert.doesNotThrow(() => verifyVoiceCallback({
    policy: { secret: "test-secret", maxAgeSeconds: 300 },
    timestamp,
    signature,
    rawBody,
    now: new Date("2026-10-05T14:00:00Z"),
  }));
  assert.throws(() => verifyVoiceCallback({
    policy: { secret: "test-secret", maxAgeSeconds: 300 },
    timestamp,
    signature,
    rawBody: '{"event_id":"evt-2"}',
    now: new Date("2026-10-05T14:00:00Z"),
  }), /SIGNATURE_MISMATCH/);
});
