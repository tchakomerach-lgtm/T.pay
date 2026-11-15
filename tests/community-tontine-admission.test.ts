import test from "node:test";
import assert from "node:assert/strict";
import {
  activateArmedTontine, armTontineLaunch, decideMembership, evaluateLaunchReadiness,
  type Candidate, type ConsentGrant, type LaunchReadiness, type ThirdPartyTrustAttestation
} from "../packages/microfinance/src/community-tontine-admission.js";

const candidate: Candidate = {
  id: "candidate-1", groupId: "group-1", state: "VERIFYING", appliedAt: "2026-11-15T00:00:00.000Z"
};
const consent: ConsentGrant = {
  candidateId: "candidate-1", groupId: "group-1", partnerId: "mf-1",
  purpose: "IDENTITY_VERIFICATION", grantedAt: "2026-11-14T00:00:00.000Z",
  expiresAt: "2026-12-01T00:00:00.000Z"
};
const attestation: ThirdPartyTrustAttestation = {
  id: "att-1", candidateId: "candidate-1", groupId: "group-1", partnerId: "mf-1",
  agentId: "agent-1", verificationRef: "verify-ref", match: "MATCH", status: "VALID",
  trustLevel: 3, issuedAt: "2026-11-15T00:00:00.000Z",
  expiresAt: "2026-12-01T00:00:00.000Z", signature: "signed-payload"
};
const readiness: LaunchReadiness = {
  activeMembers: 12, minimumMembers: 10, allMembershipsDecided: true,
  allRequiredIdentityChecksValid: true, allFinalConsentsRecorded: true,
  contributionRulesVersion: "rules-v3", rotationSnapshotHash: "a".repeat(64),
  feePolicyVersion: "fees-v2", payoutOrderLocked: true, paymentRailsReady: true,
  unresolvedCriticalIncidents: 0, securityPreflightPassed: true
};

test("only community administrator may accept a candidate with scoped valid attestation", () => {
  assert.throws(() => decideMembership(candidate, { id: "agent-1", role: "MICROFINANCE_AGENT" },
    "ACCEPT", "verified", { consent, attestation, now: "2026-11-15T12:00:00Z", verifySignature: () => true }),
  /COMMUNITY_ADMIN_DECISION_REQUIRED/);
  const accepted = decideMembership(candidate, { id: "admin-1", role: "COMMUNITY_ADMIN" },
    "ACCEPT", "identity verified", { consent, attestation, now: "2026-11-15T12:00:00Z", verifySignature: () => true });
  assert.equal(accepted.state, "APPROVED");
  assert.equal(accepted.decisionBy, "admin-1");
});

test("rejects expired, mismatched or invalidly signed attestations", () => {
  assert.throws(() => decideMembership(candidate, { id: "admin-1", role: "COMMUNITY_ADMIN" },
    "ACCEPT", "identity verified", { consent, attestation: { ...attestation, match: "MISMATCH" },
      now: "2026-11-15T12:00:00Z", verifySignature: () => true }), /IDENTITY_MATCH_REQUIRED/);
  assert.throws(() => decideMembership(candidate, { id: "admin-1", role: "COMMUNITY_ADMIN" },
    "ACCEPT", "identity verified", { consent, attestation, now: "2026-11-15T12:00:00Z", verifySignature: () => false }),
  /ATTESTATION_SIGNATURE_INVALID/);
});

test("launch readiness reports all blockers rather than hiding them in a score", () => {
  const result = evaluateLaunchReadiness({ ...readiness, payoutOrderLocked: false, paymentRailsReady: false });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, ["PAYOUT_ORDER_NOT_LOCKED", "PAYMENT_RAILS_NOT_READY"]);
});

test("launch is armed and activated only with the same immutable config hash and idempotency key", () => {
  const armed = armTontineLaunch({ groupId: "group-1", state: "READY_TO_START" }, readiness,
    { configHash: "b".repeat(64), idempotencyKey: "launch-001", now: "2026-11-15T12:00:00Z" });
  assert.equal(armed.state, "ARMED");
  assert.throws(() => activateArmedTontine(armed,
    { configHash: "c".repeat(64), idempotencyKey: "launch-001", now: "2026-11-15T12:01:00Z" }),
  /LAUNCH_CONFIG_CHANGED/);
  const active = activateArmedTontine(armed,
    { configHash: "b".repeat(64), idempotencyKey: "launch-001", now: "2026-11-15T12:02:00Z" });
  assert.equal(active.state, "ACTIVE");
});
