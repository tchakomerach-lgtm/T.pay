import test from "node:test";
import assert from "node:assert/strict";
import type { UUID } from "../packages/domain/src/types.js";
import {
  createTontinePaymentIntent,
  snapshotTontineFees,
  settleVerifiedProviderEvent,
  createSignedProviderWebhook,
  type TontineSettlementProvider
} from "../packages/microfinance/src/tontine-settlement.js";
import type { TontineContribution } from "../packages/microfinance/src/community-tontine.js";
import type { WebhookEnvelope } from "../packages/security/src/webhook.js";

const contribution: TontineContribution = {
  id: "contrib-1" as UUID, groupId: "group-1" as UUID, membershipId: "member-1" as UUID,
  scheduledFor: "2026-10-03", amountMinor: 1000n, currency: "XOF", status: "pending",
  channel: "mobile_money", idempotencyKey: "idem-1234567890123456"
};

const provider: TontineSettlementProvider = {
  name: "tmoney",
  async initiate() {
    return { provider: "tmoney", providerReference: "tm-1", status: "accepted", rawStatus: "SUCCESS" };
  },
  verifyWebhook(envelope: WebhookEnvelope) {
    const body = JSON.parse(envelope.payload) as {
      paymentId: UUID; providerReference: string; amountMinor: string; currency: string;
      status: "accepted" | "pending" | "rejected";
    };
    return {
      provider: envelope.provider, eventId: envelope.eventId, paymentId: body.paymentId,
      providerReference: body.providerReference, amountMinor: BigInt(body.amountMinor),
      currency: body.currency, status: body.status, occurredAt: "2026-10-03T12:00:00Z"
    };
  }
};

test("payment intent preserves the contribution idempotency identity", () => {
  const intent = createTontinePaymentIntent({
    id: "payment-1" as UUID, organizationId: "org-1" as UUID,
    contribution, provider: "tmoney", now: "2026-10-03T12:00:00Z"
  });
  assert.equal(intent.idempotencyKey, contribution.idempotencyKey);
  assert.equal(intent.amountMinor, 1000n);
});

test("fee snapshot is immutable data with versioned rules", () => {
  const snapshot = snapshotTontineFees(1000n, "XOF", {
    microfinance: { id:"mf-v1", name:"MF", rateBps:100, active:true },
    tpay: { id:"tpay-v1", name:"T.Pay", rateBps:500, active:true },
    ruleVersion:"fees-2026-10-03"
  }, "2026-10-03T12:00:00Z", contribution.id);
  assert.equal(snapshot.microfinanceFeeMinor, 10n);
  assert.equal(snapshot.tpayFeeMinor, 50n);
  assert.equal(snapshot.totalFeeMinor, 60n);
  assert.equal(snapshot.ruleVersion, "fees-2026-10-03");
});

test("signed provider verification reaches the atomic settlement boundary", async () => {
  let settled = 0;
  const payment = createTontinePaymentIntent({
    id: "payment-2" as UUID, organizationId: "org-1" as UUID,
    contribution, provider: "tmoney", now: "2026-10-03T12:00:00Z"
  });
  const paymentWithRef = { ...payment, providerReference:"tm-2", status:"pending" as const };
  const envelope = createSignedProviderWebhook("secret", "tmoney", "evt-1", 1791028800, JSON.stringify({
    paymentId: payment.id, providerReference:"tm-2", amountMinor:"1000",
    currency:"XOF", status:"accepted"
  }));
  const repository = {
    async settleAtomically(input: any) {
      settled++;
      return { replay:false, receipt:input.receipt };
    }
  } as any;
  const ledgerFactory = {
    createContributionTransaction() {
      return {
        id:"ledger-1", organizationId:"org-1" as UUID,
        idempotencyKey:contribution.idempotencyKey, occurredAt:"2026-10-03T12:00:00Z",
        lines:[
          {accountId:"cash",amount:{currency:"XOF",minor:1000n},direction:"debit" as const},
          {accountId:"tontine",amount:{currency:"XOF",minor:1000n},direction:"credit" as const}
        ], postedAt:"2026-10-03T12:00:00Z"
      };
    }
  };
  const result = await settleVerifiedProviderEvent({
    envelope, secret:"secret", nowEpochSeconds:1791028800,
    paymentIntent:paymentWithRef, contribution,
    feePolicy:{
      microfinance:{id:"mf",name:"MF",rateBps:100,active:true},
      tpay:{id:"tpay",name:"T.Pay",rateBps:500,active:true}, ruleVersion:"v1"
    },
    ledgerFactory, receiptId:"receipt-1" as UUID, now:"2026-10-03T12:00:00Z"
  }, {provider, repository});
  assert.equal(result.replay,false);
  assert.equal(settled,1);
});

test("invalid provider signatures are rejected before financial settlement", async () => {
  const payment = createTontinePaymentIntent({
    id: "payment-3" as UUID, organizationId: "org-1" as UUID,
    contribution, provider: "tmoney", now: "2026-10-03T12:00:00Z"
  });
  const envelope = createSignedProviderWebhook("secret", "tmoney", "evt-2", 1791028800, "{}");
  await assert.rejects(
    () => settleVerifiedProviderEvent({
      envelope: { ...envelope, signature:"bad" }, secret:"secret", nowEpochSeconds:1791028800,
      paymentIntent:{...payment, providerReference:"tm-3", status:"pending"},
      contribution,
      feePolicy:{
        microfinance:{id:"mf",name:"MF",rateBps:100,active:true},
        tpay:{id:"tpay",name:"T.Pay",rateBps:500,active:true}, ruleVersion:"v1"
      },
      ledgerFactory:{ createContributionTransaction(){ throw new Error("MUST_NOT_POST"); } },
      receiptId:"receipt-2" as UUID, now:"2026-10-03T12:00:00Z"
    }, {provider, repository:{} as any}),
    /WEBHOOK_SIGNATURE_INVALID/
  );
});
