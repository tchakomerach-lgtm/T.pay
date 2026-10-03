import test from "node:test";
import assert from "node:assert/strict";
import { signWebhook, verifyWebhookSignature } from "../packages/security/src/webhook.js";
import { validateCollection, assertCollectionLocation } from "../packages/microfinance/src/tontine.js";
import { buildContinuityQueue } from "../packages/microfinance/src/field-agent.js";
import { assertSubsidyTransition, validateRecoveryPlan } from "../packages/education/src/subsidy.js";

test("webhook signatures reject tampering", () => {
  const timestamp = 1000;
  const signature = signWebhook("test-key", timestamp, "payload");
  assert.doesNotThrow(() => verifyWebhookSignature("test-key", {
    provider:"test", eventId:"e1", timestamp, signature, payload:"payload"
  }, 300, 1000));
  assert.throws(() => verifyWebhookSignature("test-key", {
    provider:"test", eventId:"e1", timestamp, signature, payload:"tampered"
  }, 300, 1000), /WEBHOOK_SIGNATURE_INVALID/);
});

test("tontine collection enforces minimum and location", () => {
  const member = {id:"m",groupId:"g",clientId:"c",dailyMinimumMinor:500n,currency:"XOF",status:"active" as const};
  const collection = {id:"c1",memberId:"m",agentId:"a",scheduledFor:"2026-10-03",amountMinor:500n,currency:"XOF",status:"collected" as const,idempotencyKey:"idem-123456789012",location:{latitude:6.1,longitude:1.2}};
  assert.doesNotThrow(() => validateCollection(collection, member));
  assert.doesNotThrow(() => assertCollectionLocation(collection));
  assert.throws(() => validateCollection({...collection,amountMinor:100n}, member), /TONTINE_BELOW_MINIMUM/);
});

test("field collection continuity finds clients whose agent is unavailable", () => {
  const clients = [
    {clientId:"1",latitude:6,longitude:1,priority:"normal" as const,assignedAgentId:"a1"},
    {clientId:"2",latitude:6,longitude:1,priority:"high_risk" as const,assignedAgentId:"a2"}
  ];
  const queue = buildContinuityQueue(clients,[{agentId:"a1",available:true,lastHeartbeatAt:"now"},{agentId:"a2",available:false,lastHeartbeatAt:"old"}]);
  assert.deepEqual(queue.map(x=>x.clientId),["2"]);
});

test("school subsidy transitions are state-machine controlled", () => {
  assert.doesNotThrow(() => assertSubsidyTransition("approved","funded"));
  assert.throws(() => assertSubsidyTransition("closed","funded"), /INVALID_SUBSIDY_TRANSITION/);
  assert.throws(() => validateRecoveryPlan({id:"p",subsidyId:"s",parentClientId:"p",dailyMinimumMinor:499n,currency:"XOF",status:"pending"}), /RECOVERY_DAILY_MINIMUM_TOO_LOW/);
});
