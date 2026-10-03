import test from "node:test";
import assert from "node:assert/strict";
import { parseProviderCallback, verifyAndClaimProviderCallback, type ProviderReplayGuard, type ProviderSecretResolver } from "../packages/security/src/provider-callback.js";
import { signWebhook } from "../packages/security/src/webhook.js";

const secret = "test-secret";
const body = JSON.stringify({ event: "payment.confirmed", amount: 1500, currency: "XOF" });
const timestamp = 1800000000;
const headers = (eventId = "evt-1") => ({ providerId: "tmoney", eventId, timestamp: String(timestamp), signature: signWebhook(secret, timestamp, body) });
const resolver = (): ProviderSecretResolver => ({ resolve: async id => id === "tmoney" ? secret : null });
const replayStore = (): ProviderReplayGuard => {
  const seen = new Set<string>();
  return { claim: async (providerId, eventId) => { const key = providerId + ":" + eventId; if (seen.has(key)) return false; seen.add(key); return true; } };
};

test("parses strict callback envelope and preserves raw body", () => {
  const envelope = parseProviderCallback(headers(), body);
  assert.equal(envelope.providerId, "tmoney");
  assert.equal(envelope.eventId, "evt-1");
  assert.equal(envelope.rawBody, body);
});

test("rejects malformed identity timestamp signature and oversized body", () => {
  assert.throws(() => parseProviderCallback({ ...headers(), eventId: "bad space" }, body), /CALLBACK_EVENT_ID_INVALID/);
  assert.throws(() => parseProviderCallback({ ...headers(), timestamp: "NaN" }, body), /CALLBACK_TIMESTAMP_INVALID/);
  assert.throws(() => parseProviderCallback({ ...headers(), signature: "aa" }, body), /CALLBACK_SIGNATURE_FORMAT_INVALID/);
  assert.throws(() => parseProviderCallback(headers(), "x".repeat(20), 10), /CALLBACK_BODY_INVALID/);
});

test("verifies signature before claiming replay", async () => {
  let claims = 0;
  const replay: ProviderReplayGuard = { claim: async () => { claims += 1; return true; } };
  await verifyAndClaimProviderCallback(parseProviderCallback(headers(), body), resolver(), replay, { now: timestamp });
  assert.equal(claims, 1);
  await assert.rejects(verifyAndClaimProviderCallback(parseProviderCallback({ ...headers(), signature: signWebhook(secret, timestamp, body + "tampered") }, body), resolver(), replay, { now: timestamp }), /CALLBACK_SIGNATURE_INVALID/);
  assert.equal(claims, 1);
});

test("rejects stale callback before replay claim", async () => {
  let claims = 0;
  const replay: ProviderReplayGuard = { claim: async () => { claims += 1; return true; } };
  await assert.rejects(verifyAndClaimProviderCallback(parseProviderCallback(headers(), body), resolver(), replay, { now: timestamp + 301, maxAgeSeconds: 300 }), /CALLBACK_EXPIRED/);
  assert.equal(claims, 0);
});

test("rejects replay after first claim", async () => {
  const replay = replayStore();
  const envelope = parseProviderCallback(headers("evt-replay"), body);
  await verifyAndClaimProviderCallback(envelope, resolver(), replay, { now: timestamp });
  await assert.rejects(verifyAndClaimProviderCallback(envelope, resolver(), replay, { now: timestamp }), /CALLBACK_REPLAY/);
});

test("verification produces evidence only and has no financial dependency", async () => {
  const verified = await verifyAndClaimProviderCallback(parseProviderCallback(headers("evt-no-ledger"), body), resolver(), replayStore(), { now: timestamp });
  assert.equal(verified.eventId, "evt-no-ledger");
});
