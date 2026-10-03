import test from "node:test";
import assert from "node:assert/strict";
import { deriveNotificationIntents } from "../packages/events/src/notification-router.js";

test("router creates stable generic notification intents and does not expose financial values", async () => {
  const event = { type: "payment.completed" as const, paymentId: "33333333-3333-4333-8333-333333333333", organizationId: "22222222-2222-4222-8222-222222222222", occurredAt: "2026-10-03T22:30:00Z" };
  const resolver = { resolve: async () => [{ userId: "11111111-1111-4111-8111-111111111111", organizationId: event.organizationId, channels: ["in_app" as const, "push" as const] }] };
  const first = await deriveNotificationIntents("44444444-4444-4444-8444-444444444444", event, resolver, event.occurredAt);
  const second = await deriveNotificationIntents("44444444-4444-4444-8444-444444444444", event, resolver, event.occurredAt);
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  assert.equal(first[0]?.sensitivity, "generic");
  assert.equal(Object.prototype.hasOwnProperty.call(first[0] ?? {}, "amountMinor"), false);
});

test("router does not create intents for events without a notification policy", async () => {
  const event = { type: "ledger.transaction_posted" as const, transactionId: "33333333-3333-4333-8333-333333333333", organizationId: "22222222-2222-4222-8222-222222222222", occurredAt: "2026-10-03T22:30:00Z" };
  const intents = await deriveNotificationIntents("44444444-4444-4444-8444-444444444444", event, { resolve: async () => [] }, event.occurredAt);
  assert.deepEqual(intents, []);
});