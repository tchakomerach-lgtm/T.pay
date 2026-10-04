import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { executeDurableTontineSettlement } from "../packages/microfinance/src/tontine-settlement-uow.js";
import { verifyProviderCallbackSignature, verifyAndClaimProviderCallback, parseProviderCallback } from "../packages/security/src/provider-callback.js";
import type { DurableSettlementInput } from "../packages/microfinance/src/tontine-settlement-uow.js";

const id = (value: string) => value as never;

function settlementInput(overrides: { providerEvent?: Partial<DurableSettlementInput["providerEvent"]> } = {}): DurableSettlementInput {
  const organizationId = id("11111111-1111-4111-8111-111111111111");
  const contributionId = id("22222222-2222-4222-8222-222222222222");
  const paymentId = id("33333333-3333-4333-8333-333333333333");
  const key = "s03.9-idempotency-key";
  const now = "2026-10-03T22:50:00.000Z";
  const paymentIntent = {
    id: paymentId, organizationId, contributionId, idempotencyKey: key,
    amountMinor: 1000n, currency: "XOF", provider: "tmoney",
    providerReference: "TM-123", status: "provider_confirmed" as const, createdAt: now, updatedAt: now
  };
  const contribution = {
    id: contributionId, groupId: id("44444444-4444-4444-8444-444444444444"),
    membershipId: id("55555555-5555-4555-8555-555555555555"), scheduledFor: now,
    amountMinor: 1000n, currency: "XOF", status: "pending" as const, channel: "mobile_money" as const, idempotencyKey: key
  };
  const providerEvent = {
    provider: "tmoney", eventId: "evt-123", paymentId, providerReference: "TM-123",
    amountMinor: 1000n, currency: "XOF", status: "accepted" as const, occurredAt: now
  };
  const ledgerTransaction = {
    id: "ledger-123", organizationId, idempotencyKey: key, occurredAt: now, postedAt: now,
    lines: [
      { accountId: "cash", amount: { currency: "XOF", minor: 1000n }, direction: "debit" as const },
      { accountId: "tontine", amount: { currency: "XOF", minor: 1000n }, direction: "credit" as const }
    ]
  };
  const receipt = {
    receiptId: id("66666666-6666-4666-8666-666666666666"), contributionId, paymentIntentId: paymentId,
    providerReference: "TM-123", amountMinor: 1000n, currency: "XOF", issuedAt: now, ledgerTransactionId: "ledger-123"
  };
  return {
    organizationId, paymentIntent, contribution, providerEvent,
    feeSnapshot: { contributionId, microfinanceFeeMinor: 10n, tpayFeeMinor: 10n, totalFeeMinor: 20n, currency: "XOF", ruleVersion: "r1", calculatedAt: now },
    ledgerTransaction, receipt,
    outboxEvent: { id: "outbox-123", eventType: "tontine.contribution_confirmed", payload: "{}" },
    now,
    ...overrides
  };
}

function fakeRepository() {
  let ledgerPosted = false;
  const claimedEvents = new Set<string>();
  let queue = Promise.resolve();
  const input = settlementInput();

  return {
    input,
    postedCount: () => ledgerPosted ? 1 : 0,
    runAtomic: async (_opts: any, operation: any) => {
      const previous = queue;
      let release!: () => void;
      queue = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        const tx = {
          isolation: "serializable", organizationId: input.organizationId, transactionId: "tx",
          providerEvents: {
            claim: async (provider: string, eventId: string) => {
              const key = provider + ":" + eventId;
              if (claimedEvents.has(key)) return false;
              claimedEvents.add(key);
              return true;
            }
          },
          ledger: {
            findByIdempotencyKey: async () => ledgerPosted ? { id: "ledger-123" } : undefined,
            append: async () => { ledgerPosted = true; }
          },
          contributions: {
            getForUpdate: async () => input.contribution,
            confirm: async () => {}
          },
          payments: {
            getForUpdate: async () => input.paymentIntent,
            markSettled: async () => {}
          },
          fees: { insertImmutable: async () => {} },
          receipts: { insert: async () => {} },
          outbox: { enqueue: async () => {} }
        };
        return await operation(tx);
      } finally {
        release();
      }
    }
  };
}

test("S-03.9 rejects provider/payment identity, amount, currency and status contradictions before persistence", async () => {
  const base = settlementInput();
  await assert.rejects(() => executeDurableTontineSettlement({ ...base, providerEvent: { ...base.providerEvent, paymentId: id("99999999-9999-4999-8999-999999999999") } }, fakeRepository() as any), /PAYMENT_INTENT_MISMATCH/);
  await assert.rejects(() => executeDurableTontineSettlement({ ...base, providerEvent: { ...base.providerEvent, amountMinor: 900n } }, fakeRepository() as any), /PROVIDER_AMOUNT_OR_CURRENCY_MISMATCH/);
  await assert.rejects(() => executeDurableTontineSettlement({ ...base, providerEvent: { ...base.providerEvent, currency: "EUR" } }, fakeRepository() as any), /PROVIDER_AMOUNT_OR_CURRENCY_MISMATCH/);
  await assert.rejects(() => executeDurableTontineSettlement({ ...base, providerEvent: { ...base.providerEvent, status: "pending" } }, fakeRepository() as any), /SETTLEMENT_PROVIDER_NOT_ACCEPTED/);
});

test("S-03.9 two concurrent settlements with the same idempotency key produce one financial effect", async () => {
  const repository = fakeRepository();
  const [first, second] = await Promise.all([
    executeDurableTontineSettlement(repository.input, repository as any),
    executeDurableTontineSettlement(repository.input, repository as any)
  ]);
  assert.equal(repository.postedCount(), 1);
  assert.equal([first.replay, second.replay].filter(Boolean).length, 1);
});

test("S-03.9 provider callback replay is rejected after the first atomic claim", async () => {
  const rawBody = JSON.stringify({ paymentId: "p1", status: "accepted" });
  const timestamp = 1800000000;
  const secret = "test-secret";
  const signature = createHmac("sha256", secret).update(timestamp + "." + rawBody, "utf8").digest("hex");
  const envelope = parseProviderCallback({ providerId: "tmoney", eventId: "evt-replay", timestamp: String(timestamp), signature }, rawBody);
  const replayed = new Set<string>();
  const secrets = { resolve: async () => secret };
  const guard = { claim: async (providerId: string, eventId: string) => {
    const key = providerId + ":" + eventId;
    if (replayed.has(key)) return false;
    replayed.add(key);
    return true;
  }};
  await verifyAndClaimProviderCallback(envelope, secrets, guard, { now: timestamp, receivedAt: "2026-10-03T22:50:00Z" });
  await assert.rejects(() => verifyAndClaimProviderCallback(envelope, secrets, guard, { now: timestamp }), /CALLBACK_REPLAY/);
});

test("S-03.9 callback freshness boundary rejects an expired signed event", () => {
  const rawBody = "{}";
  const timestamp = 1800000000;
  const signature = createHmac("sha256", "secret").update(timestamp + "." + rawBody, "utf8").digest("hex");
  const envelope = parseProviderCallback({ providerId: "tmoney", eventId: "evt-old", timestamp: String(timestamp), signature }, rawBody);
  assert.throws(() => verifyProviderCallbackSignature("secret", envelope, 300, timestamp + 301), /CALLBACK_EXPIRED/);
});
