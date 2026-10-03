import test from "node:test";
import assert from "node:assert/strict";
import { reconcile } from "../packages/finance/src/reconciliation.js";
import { classifyReconciliationException } from "../packages/finance/src/reconciliation-exception.js";
test("amount divergence is critical", () => {
  const outcome = reconcile({internalPaymentId:"p1",providerReference:"pr1",internalAmountMinor:1000n,providerAmountMinor:900n,internalCurrency:"XOF",providerCurrency:"XOF",internalStatus:"settled",providerStatus:"settled"});
  assert.equal(outcome,"amount_mismatch");
  const exception = classifyReconciliationException({id:"11111111-1111-4111-8111-111111111111",organizationId:"22222222-2222-4222-8222-222222222222",kind:outcome,evidenceHash:"a".repeat(64),detectedAt:"2026-10-03T22:40:00Z"});
  assert.equal(exception.severity,"critical"); assert.equal(exception.status,"open");
});
test("provider-only never posts financial state", () => assert.equal(reconcile({providerReference:"provider-ref"}),"provider_only"));
test("matching payment remains matched", () => assert.equal(reconcile({internalPaymentId:"p1",providerReference:"pr1",internalAmountMinor:1000n,providerAmountMinor:1000n,internalCurrency:"XOF",providerCurrency:"XOF",internalStatus:"settled",providerStatus:"settled"}),"matched"));