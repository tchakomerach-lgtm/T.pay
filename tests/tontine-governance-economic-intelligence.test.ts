import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGovernance, validateGovernancePolicy } from "../packages/microfinance/src/tontine-governance-policy.js";
import { chooseBestValueBid, assertDeliveryProgress } from "../packages/microfinance/src/tontine-economic-network.js";
import { buildCommunityStressIndex, validatePrediction } from "../packages/microfinance/src/tontine-intelligence.js";

test("governance requires quorum before approval", () => {
  const policy = { quorumPercent: 60, approvalPercent: 60, allowAbstention: true };
  validateGovernancePolicy(policy);
  assert.equal(evaluateGovernance([], 5, policy), "quorum_pending");
  const votes = [
    { id: "v1" as never, proposalId: "p" as never, voterId: "u1" as never, choice: "approve" as const, castAt: "2026-10-05T00:00:00Z" },
    { id: "v2" as never, proposalId: "p" as never, voterId: "u2" as never, choice: "approve" as const, castAt: "2026-10-05T00:00:00Z" },
    { id: "v3" as never, proposalId: "p" as never, voterId: "u3" as never, choice: "reject" as const, castAt: "2026-10-05T00:00:00Z" }
  ];
  assert.equal(evaluateGovernance(votes, 5, policy), "approved");
});

test("community procurement chooses best-value deterministic bid and blocks delivery regression", () => {
  const bids = [
    { id: "b2" as never, demandId: "d" as never, supplierId: "s2" as never, state: "submitted" as const, totalMinor: 9500n, currency: "XOF", validUntil: "2026-10-06T00:00:00Z", qualityTerms: "standard" },
    { id: "b1" as never, demandId: "d" as never, supplierId: "s1" as never, state: "shortlisted" as const, totalMinor: 9000n, currency: "XOF", validUntil: "2026-10-06T00:00:00Z", qualityTerms: "premium" }
  ];
  assert.equal(chooseBestValueBid(bids).id, "b1");
  const current = { id: "m1" as never, purchaseOrderId: "o" as never, state: "partial" as const, quantityDelivered: 10n };
  const regression = { ...current, state: "partial" as const, quantityDelivered: 9n };
  assert.throws(() => assertDeliveryProgress(current, regression), /COMMUNITY_DELIVERY_QUANTITY_REGRESSION/);
});

test("community intelligence stays explainable and bounded", () => {
  const prediction = {
    id: "p" as never, groupId: "g" as never, horizon: "H1" as const,
    target: "stress" as const, probability: 0.72, confidence: 0.81,
    evidenceRefs: ["metric:collection_rate"], createdAt: "2026-10-05T00:00:00Z"
  };
  assert.doesNotThrow(() => validatePrediction(prediction));
  assert.equal(buildCommunityStressIndex([
    { name: "collection_rate", value: 80, confidence: 0.9, observedAt: "2026-10-05T00:00:00Z" },
    { name: "dispute_rate", value: 10, confidence: 0.9, observedAt: "2026-10-05T00:00:00Z" }
  ]), 15);
});
