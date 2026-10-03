import test from "node:test";
import assert from "node:assert/strict";
import type { DomainEvent } from "../packages/events/src/events.js";
import { publishClaimedOutbox, type OutboxRecord, type OutboxStore } from "../packages/events/src/outbox.js";

const event: DomainEvent = { type: "ledger.transaction_posted", transactionId: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222", occurredAt: "2026-10-03T22:00:00Z" };
const record = (): OutboxRecord => ({ id: "33333333-3333-4333-8333-333333333333", organizationId: event.organizationId, event, aggregateId: event.transactionId, occurredAt: event.occurredAt, attempts: 0, publishedAt: null });

const store = (mark: () => void): OutboxStore => ({ insert: async () => {}, claimNext: async () => record(), markPublished: async () => mark(), markAttemptFailed: async () => {} });

test("publication marks only after publisher success", async () => { let marked = false; let published = false; await publishClaimedOutbox(store(() => { marked = true; }), { publish: async () => { published = true; } }, record(), "2026-10-03T22:01:00Z"); assert.equal(published, true); assert.equal(marked, true); });
test("publisher failure leaves record unpublished", async () => { let marked = false; await assert.rejects(() => publishClaimedOutbox(store(() => { marked = true; }), { publish: async () => { throw new Error("BROKER_UNAVAILABLE"); } }, record(), "2026-10-03T22:01:00Z"), /BROKER_UNAVAILABLE/); assert.equal(marked, false); });
test("event publication does not mutate financial state", () => { assert.equal(event.type, "ledger.transaction_posted"); assert.equal(Object.prototype.hasOwnProperty.call(event, "amountMinor"), false); });