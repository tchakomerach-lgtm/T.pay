import test from "node:test";
import assert from "node:assert/strict";
import {
  assertMfMayOperateCommunityTontine, assertMfScope, assertMfCapability,
  assertSettlementMayProceed, assertReconciliationRequired
} from "../packages/microfinance/src/community-tontine-management.js";

const id = "11111111-1111-4111-8111-111111111111" as any;
const access = {
  id, organizationId:id, tontineGroupId:id, microfinanceId:id, role:"settlement_officer" as const,
  status:"active" as const, grantedBy:id, createdAt:"2026-10-05T00:00:00Z", expiresAt:"2026-10-06T00:00:00Z"
};

test("microfinance community tontine access is scoped and time bounded", () => {
  assert.doesNotThrow(() => assertMfMayOperateCommunityTontine(access, "2026-10-05T12:00:00Z"));
  assert.doesNotThrow(() => assertMfScope(access, id, id, id, "2026-10-05T12:00:00Z"));
  assert.throws(() => assertMfScope(access, id, "22222222-2222-4222-8222-222222222222" as any, id, "2026-10-05T12:00:00Z"), /GROUP_SCOPE_DENIED/);
  assert.doesNotThrow(() => assertMfCapability(access, "payout.prepare"));
  assert.throws(() => assertMfCapability(access, "payout.approve"), /CAPABILITY_DENIED/);
});

test("microfinance settlement requires explicit human approval by default", () => {
  assert.doesNotThrow(() => assertSettlementMayProceed({
    id, tontineGroupId:id, microfinanceId:id, payoutId:id, beneficiaryClientId:id,
    amountMinor:1000n, currency:"XOF", destinationRef:"client:1",
    requiresHumanApproval:true, state:"approved", createdAt:"2026-10-05T12:00:00Z"
  }));
  assert.throws(() => assertSettlementMayProceed({
    id, tontineGroupId:id, microfinanceId:id, payoutId:id, beneficiaryClientId:id,
    amountMinor:1000n, currency:"XOF", destinationRef:"client:1",
    requiresHumanApproval:false, state:"approved", createdAt:"2026-10-05T12:00:00Z"
  }), /HUMAN_APPROVAL_REQUIRED/);
});

test("explicit low-risk automation remains bounded", () => {
  assert.doesNotThrow(() => assertSettlementMayProceed({
    id, tontineGroupId:id, microfinanceId:id, payoutId:id, beneficiaryClientId:id,
    amountMinor:1000n, currency:"XOF", destinationRef:"client:1",
    requiresHumanApproval:false, state:"approved", createdAt:"2026-10-05T12:00:00Z"
  }, {humanApprovalRequired:false, lowRiskAutomationEnabled:true, maxAutomatedAmountMinor:2000n}));
  assert.throws(() => assertSettlementMayProceed({
    id, tontineGroupId:id, microfinanceId:id, payoutId:id, beneficiaryClientId:id,
    amountMinor:3000n, currency:"XOF", destinationRef:"client:1",
    requiresHumanApproval:false, state:"approved", createdAt:"2026-10-05T12:00:00Z"
  }, {humanApprovalRequired:false, lowRiskAutomationEnabled:true, maxAutomatedAmountMinor:2000n}), /AUTOMATION_NOT_ALLOWED/);
});

test("microfinance/provider mismatch becomes reconciliation, never silent correction", () => {
  assert.throws(() => assertReconciliationRequired(1000n, 900n), /RECONCILIATION_REQUIRED/);
  assert.doesNotThrow(() => assertReconciliationRequired(1000n, 1000n));
});
