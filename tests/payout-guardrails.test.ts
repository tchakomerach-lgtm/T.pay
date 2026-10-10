import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePayoutGuardrails, type PayoutGuardrailInput } from "../packages/finance/src/payout-guardrails.js";
const base: PayoutGuardrailInput = {
  amountMinor: 10_000n, currency: "XOF", spendableTreasuryMinor: 100_000n,
  minimumLiquidityBufferMinor: 20_000n, dailyPaidMinor: 5_000n, dailyLimitMinor: 50_000n,
  destinationVerified: true, now: "2026-10-10T02:00:00.000Z", destinationCooldownSeconds: 86_400,
  providerAvailable: true, riskHoldActive: false, humanApprovalRequired: true, humanApprovalPresent: true
};
test("GAIN-009 allows a payout only when all preflight controls pass", () => {
  assert.equal(evaluatePayoutGuardrails(base).action, "allow_for_authorized_execution");
});
test("GAIN-009 rejects a payout that would breach the minimum liquidity buffer", () => {
  const result = evaluatePayoutGuardrails({ ...base, amountMinor: 85_000n });
  assert.equal(result.action, "reject");
  assert.ok(result.reasons.includes("INSUFFICIENT_TREASURY_LIQUIDITY"));
});
test("GAIN-009 rejects daily limit overflow using integer minor units", () => {
  const result = evaluatePayoutGuardrails({ ...base, dailyPaidMinor: 45_000n });
  assert.equal(result.action, "reject");
  assert.ok(result.reasons.includes("DAILY_LIMIT_EXCEEDED"));
});
test("GAIN-009 holds an unverified destination recently changed", () => {
  const result = evaluatePayoutGuardrails({ ...base, destinationVerified: false, destinationChangedAt: "2026-10-10T01:59:00.000Z" });
  assert.equal(result.action, "hold_for_review");
  assert.ok(result.reasons.includes("DESTINATION_NOT_VERIFIED"));
  assert.ok(result.reasons.includes("DESTINATION_COOLDOWN_ACTIVE"));
});
test("GAIN-009 holds when provider is unavailable", () => {
  const result = evaluatePayoutGuardrails({ ...base, providerAvailable: false });
  assert.equal(result.action, "hold_for_review");
  assert.ok(result.reasons.includes("PROVIDER_UNAVAILABLE"));
});
test("GAIN-009 rejects invalid amount and fails closed on invalid timestamp", () => {
  assert.equal(evaluatePayoutGuardrails({ ...base, amountMinor: 0n }).action, "reject");
  assert.throws(() => evaluatePayoutGuardrails({ ...base, now: "not-a-date" }), /PAYOUT_GUARDRAIL_INVALID_NOW/);
});
test("GAIN-009 fails closed on negative treasury values", () => {
  assert.throws(() => evaluatePayoutGuardrails({ ...base, spendableTreasuryMinor: -1n }), /PAYOUT_GUARDRAIL_NEGATIVE_BALANCE/);
});
test("GAIN-009 holds when independent human approval is missing", () => {
  const result = evaluatePayoutGuardrails({ ...base, humanApprovalPresent: false });
  assert.equal(result.action, "hold_for_review");
  assert.ok(result.reasons.includes("HUMAN_APPROVAL_REQUIRED"));
});
