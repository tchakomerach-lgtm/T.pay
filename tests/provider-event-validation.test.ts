import test from "node:test";
import assert from "node:assert/strict";
import {
  validateProviderEventAgainstPayment,
  type DurableSettlementInput
} from "../packages/microfinance/src/tontine-settlement-uow.js";

const organizationId = "00000000-0000-0000-0000-000000000001" as never;
const paymentIntent = {
  id: "00000000-0000-0000-0000-000000000010" as never,
  organizationId,
  contributionId: "00000000-0000-0000-0000-000000000011" as never,
  idempotencyKey: "idempotency-key-001",
  amountMinor: 1500n,
  currency: "XOF",
  provider: "tmoney",
  providerReference: "TM-123",
  status: "provider_confirmed" as const,
  createdAt: "2026-10-03T20:00:00.000Z",
  updatedAt: "2026-10-03T20:00:00.000Z"
};

const validEvent = {
  provider: "tmoney",
  eventId: "evt-001",
  paymentId: paymentIntent.id,
  providerReference: "TM-123",
  amountMinor: 1500n,
  currency: "XOF",
  status: "accepted" as const,
  occurredAt: "2026-10-03T20:01:00.000Z"
};

test("S-03.3 accepts provider evidence only when identity and money match server state", () => {
  assert.doesNotThrow(() =>
    validateProviderEventAgainstPayment({ organizationId, paymentIntent, providerEvent: validEvent })
  );
});

test("S-03.3 rejects cross-provider evidence before durable replay claim", () => {
  assert.throws(
    () => validateProviderEventAgainstPayment({
      organizationId,
      paymentIntent,
      providerEvent: { ...validEvent, provider: "flooz" }
    }),
    /PROVIDER_EVENT_PROVIDER_MISMATCH/
  );
});

test("S-03.3 rejects payment, reference, amount and currency mismatches", () => {
  assert.throws(
    () => validateProviderEventAgainstPayment({
      organizationId,
      paymentIntent,
      providerEvent: { ...validEvent, paymentId: "00000000-0000-0000-0000-000000000099" as never }
    }),
    /PAYMENT_INTENT_MISMATCH/
  );
  assert.throws(
    () => validateProviderEventAgainstPayment({
      organizationId,
      paymentIntent,
      providerEvent: { ...validEvent, providerReference: "TM-WRONG" }
    }),
    /PROVIDER_REFERENCE_MISMATCH/
  );
  assert.throws(
    () => validateProviderEventAgainstPayment({
      organizationId,
      paymentIntent,
      providerEvent: { ...validEvent, amountMinor: 1501n }
    }),
    /PROVIDER_AMOUNT_OR_CURRENCY_MISMATCH/
  );
  assert.throws(
    () => validateProviderEventAgainstPayment({
      organizationId,
      paymentIntent,
      providerEvent: { ...validEvent, currency: "EUR" }
    }),
    /PROVIDER_AMOUNT_OR_CURRENCY_MISMATCH/
  );
});

test("S-03.3 rejects non-accepted provider states before claim", () => {
  assert.throws(
    () => validateProviderEventAgainstPayment({
      organizationId,
      paymentIntent,
      providerEvent: { ...validEvent, status: "pending" }
    }),
    /SETTLEMENT_PROVIDER_NOT_ACCEPTED/
  );
});

test("S-03.3 rejects organization mismatch without accepting provider evidence", () => {
  assert.throws(
    () => validateProviderEventAgainstPayment({
      organizationId: "00000000-0000-0000-0000-000000000099" as never,
      paymentIntent,
      providerEvent: validEvent
    }),
    /PROVIDER_EVENT_ORGANIZATION_MISMATCH/
  );
});
