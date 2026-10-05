import test from "node:test";
import assert from "node:assert/strict";
import { assertMfMayOperateCommunityTontine, assertSettlementMayProceed, assertReconciliationRequired } from "../packages/microfinance/src/community-tontine-management.js";

const id = "11111111-1111-4111-8111-111111111111" as any;

test("microfinance community tontine access is scoped and time bounded", () => {
  assert.doesNotThrow(() => assertMfMayOperateCommunityTontine({
    id, organizationId:id, tontineGroupId:id, microfinanceId:id, role:"settlement_officer",
    status:"active", grantedBy:id, createdAt:"2026-10-05T00:00:00Z", expiresAt:"2026-10-06T00:00:00Z"
  }, "2026-10-05T12:00:00Z"));
  assert.throws(() => assertMfMayOperateCommunityTontine({
    id, organizationId:id, tontineGroupId:id, microfinanceId:id, role:"settlement_officer",
    status:"suspended", grantedBy:id, createdAt:"2026-10-05T00:00:00Z"
  }, "2026-10-05T12:00:00Z"), /ACCESS_NOT_ACTIVE/);
});

test("microfinance settlement requires explicit approval", () => {
  assert.doesNotThrow(() => assertSettlementMayProceed({
    id, tontineGroupId:id, microfinanceId:id, payoutId:id, beneficiaryClientId:id,
    amountMinor:1000n, currency:"XOF", destinationRef:"client:1",
    requiresHumanApproval:true, state:"approved", createdAt:"2026-10-05T12:00:00Z"
  }));
  assert.throws(() => assertSettlementMayProceed({
    id, tontineGroupId:id, microfinanceId:id, payoutId:id, beneficiaryClientId:id,
    amountMinor:1000n, currency:"XOF", destinationRef:"client:1",
    requiresHumanApproval:false, state:"approved", createdAt:"2026-10-05T12:00:00Z"
  }), /APPROVAL_POLICY_REQUIRED/);
});

test("microfinance/provider mismatch becomes reconciliation, never silent correction", () => {
  assert.throws(() => assertReconciliationRequired(1000n, 900n), /RECONCILIATION_REQUIRED/);
  assert.doesNotThrow(() => assertReconciliationRequired(1000n, 1000n));
});
