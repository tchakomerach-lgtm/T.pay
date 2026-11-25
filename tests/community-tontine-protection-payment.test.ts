import assert from "node:assert/strict";
import test from "node:test";
import type { PaymentIntent, PaymentIntentRepository } from "../packages/finance/src/payment-intent.js";
import {
  createProtectionPremiumPaymentIntent,
  type CommunityTontineProtectionPaymentDependencies,
  type ProtectionPremiumPaymentSnapshot
} from "../packages/microfinance/src/community-tontine-protection-payment.js";

const base = {
  organizationId: "org-ct042",
  groupId: "group-ct042",
  premiumId: "premium-ct042",
  actorId: "member-1",
  idempotencyKey: "ct042-premium-0001",
  now: "2026-11-18T12:00:00.000Z"
};
const due: ProtectionPremiumPaymentSnapshot = {
  organizationId: base.organizationId,
  groupId: base.groupId,
  premiumId: base.premiumId,
  premiumMinor: 2500n,
  currency: "XOF",
  state: "DUE"
};

class InMemoryPaymentIntents implements PaymentIntentRepository {
  readonly rows = new Map<string, PaymentIntent>();
  async findByIdempotency(organizationId: string, key: string) {
    return this.rows.get(organizationId + "|" + key);
  }
  async insert(intent: PaymentIntent) {
    const key = intent.organizationId + "|" + intent.idempotencyKey;
    const existing = this.rows.get(key);
    if (existing) return existing;
    this.rows.set(key, intent);
    return intent;
  }
  async approve() { return undefined; }
  async reject() { return undefined; }
}

function dependencies(snapshot: ProtectionPremiumPaymentSnapshot = due) {
  const paymentIntents = new InMemoryPaymentIntents();
  const marked: Array<{ premiumId: string; paymentIntentReference: string }> = [];
  let current = { ...snapshot };
  const deps: CommunityTontineProtectionPaymentDependencies = {
    paymentIntents,
    async loadPremium() { return current; },
    async resolveAccounts() { return { payerAccountId: "member-wallet", payeeAccountId: "insurer-collection" }; },
    async markPaymentPending(input) {
      marked.push({ premiumId: input.premiumId, paymentIntentReference: input.paymentIntentReference });
      current = { ...current, state: "PAYMENT_PENDING", paymentIntentReference: input.paymentIntentReference };
    }
  };
  return { deps, paymentIntents, marked };
}

test("creates a canonical XOF Payment Intent and links the premium without posting Ledger entries", async () => {
  const { deps, paymentIntents, marked } = dependencies();
  const result = await createProtectionPremiumPaymentIntent(deps, base);
  assert.equal(result.intent.amountMinor, 2500n);
  assert.equal(result.intent.currency, "XOF");
  assert.equal(result.intent.requiresHumanApproval, true);
  assert.equal(result.intent.state, "pending_approval");
  assert.equal(result.replayed, false);
  assert.equal(marked.length, 1);
  assert.equal(marked[0]?.paymentIntentReference, result.intent.id);
  assert.equal(paymentIntents.rows.size, 1);
});

test("replays the same linked Payment Intent without re-linking the premium", async () => {
  const { deps, marked } = dependencies();
  const first = await createProtectionPremiumPaymentIntent(deps, base);
  const second = await createProtectionPremiumPaymentIntent(deps, base);
  assert.equal(second.intent.id, first.intent.id);
  assert.equal(second.replayed, true);
  assert.equal(marked.length, 1);
});

test("rejects a settled premium before creating a Payment Intent", async () => {
  const { deps, paymentIntents } = dependencies({ ...due, state: "SETTLED" });
  await assert.rejects(createProtectionPremiumPaymentIntent(deps, base), /PREMIUM_NOT_PAYABLE/);
  assert.equal(paymentIntents.rows.size, 0);
});

test("rejects non-XOF or zero-value premiums", async () => {
  const { deps: nonXof } = dependencies({ ...due, currency: "EUR" });
  await assert.rejects(createProtectionPremiumPaymentIntent(nonXof, base), /PREMIUM_AMOUNT_INVALID/);
  const { deps: zero } = dependencies({ ...due, premiumMinor: 0n });
  await assert.rejects(createProtectionPremiumPaymentIntent(zero, base), /PREMIUM_AMOUNT_INVALID/);
});

test("rejects payer/payee account collision", async () => {
  const { deps } = dependencies();
  deps.resolveAccounts = async () => ({ payerAccountId: "same", payeeAccountId: "same" });
  await assert.rejects(createProtectionPremiumPaymentIntent(deps, base), /PAYMENT_ACCOUNTS_INVALID/);
});

test("a pending premium only replays its exact linked Financial Core intent", async () => {
  const { deps, paymentIntents } = dependencies();
  const first = await createProtectionPremiumPaymentIntent(deps, base);
  const pending = { ...due, state: "PAYMENT_PENDING" as const, paymentIntentReference: first.intent.id };
  deps.loadPremium = async () => pending;
  const replay = await createProtectionPremiumPaymentIntent(deps, base);
  assert.equal(replay.intent.id, first.intent.id);
  assert.equal(replay.replayed, true);
  deps.loadPremium = async () => ({ ...pending, paymentIntentReference: "different-intent" });
  await assert.rejects(createProtectionPremiumPaymentIntent(deps, base), /PAYMENT_INTENT_REPLAY_CONFLICT/);
  assert.equal(paymentIntents.rows.size, 1);
});
