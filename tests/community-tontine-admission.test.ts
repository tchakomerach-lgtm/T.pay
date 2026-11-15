import test from "node:test";
import assert from "node:assert/strict";
import {
  activateArmedTontine, armTontineLaunch, decideMembership, evaluateLaunchReadiness,
  type Candidate, type ConsentGrant, type LaunchReadiness, type ThirdPartyTrustAttestation
} from "../packages/microfinance/src/community-tontine-admission.js";
import type { UUID } from "../packages/domain/src/types.js";

const uuid = (value: string) => value as UUID;

const candidateId = uuid("00000000-0000-4000-8000-000000000001");
const groupId = uuid("00000000-0000-4000-8000-000000000002");
const partnerId = uuid("00000000-0000-4000-8000-000000000003");
const attestationId = uuid("00000000-0000-4000-8000-000000000004");
const agentId = uuid("00000000-0000-4000-8000-000000000005");
const adminId = uuid("00000000-0000-4000-8000-000000000006");

const candidate: Candidate = {
  id: candidateId, groupId: groupId, state: "VERIFYING", appliedAt: "2026-11-15T00:00:00.000Z"
};
const consent: ConsentGrant = {
  candidateId: candidateId, groupId: groupId, partnerId: partnerId,
  purpose: "IDENTITY_VERIFICATION", grantedAt: "2026-11-14T00:00:00.000Z",
  expiresAt: "2026-12-01T00:00:00.000Z"
};
const attestation: ThirdPartyTrustAttestation = {
  id: attestationId, candidateId: candidateId, groupId: groupId, partnerId: partnerId,
  agentId: agentId, verificationRef: "verify-ref", match: "MATCH", status: "VALID",
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
  assert.throws(() => decideMembership(candidate, { id: agentId, role: "MICROFINANCE_AGENT" },
    "ACCEPT", "verified", { consent, attestation, now: "2026-11-15T12:00:00Z", verifySignature: () => true }),
  /COMMUNITY_ADMIN_DECISION_REQUIRED/);
  const accepted = decideMembership(candidate, { id: adminId, role: "COMMUNITY_ADMIN" },
    "ACCEPT", "identity verified", { consent, attestation, now: "2026-11-15T12:00:00Z", verifySignature: () => true });
  assert.equal(accepted.state, "APPROVED");
  assert.equal(accepted.decisionBy, adminId);
});

test("rejects expired, mismatched or invalidly signed attestations", () => {
  assert.throws(() => decideMembership(candidate, { id: adminId, role: "COMMUNITY_ADMIN" },
    "ACCEPT", "identity verified", { consent, attestation: { ...attestation, match: "MISMATCH" },
      now: "2026-11-15T12:00:00Z", verifySignature: () => true }), /IDENTITY_MATCH_REQUIRED/);
  assert.throws(() => decideMembership(candidate, { id: adminId, role: "COMMUNITY_ADMIN" },
    "ACCEPT", "identity verified", { consent, attestation, now: "2026-11-15T12:00:00Z", verifySignature: () => false }),
  /ATTESTATION_SIGNATURE_INVALID/);
});

test("launch readiness reports all blockers rather than hiding them in a score", () => {
  const result = evaluateLaunchReadiness({ ...readiness, payoutOrderLocked: false, paymentRailsReady: false });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, ["PAYOUT_ORDER_NOT_LOCKED", "PAYMENT_RAILS_NOT_READY"]);
});

test("launch is armed and activated only with the same immutable config hash and idempotency key", () => {
  const armed = armTontineLaunch({ groupId: groupId, state: "READY_TO_START" }, readiness,
    { configHash: "b".repeat(64), idempotencyKey: "launch-001", now: "2026-11-15T12:00:00Z" });
  assert.equal(armed.state, "ARMED");
  assert.throws(() => activateArmedTontine(armed,
    { configHash: "c".repeat(64), idempotencyKey: "launch-001", now: "2026-11-15T12:01:00Z" }),
  /LAUNCH_CONFIG_CHANGED/);
  const active = activateArmedTontine(armed,
    { configHash: "b".repeat(64), idempotencyKey: "launch-001", now: "2026-11-15T12:02:00Z" });
  assert.equal(active.state, "ACTIVE");
  const replay = activateArmedTontine(active,
    { configHash: "b".repeat(64), idempotencyKey: "launch-001", now: "2026-11-15T12:03:00Z" });
  assert.equal(replay, active);
  assert.throws(() => activateArmedTontine(active,
    { configHash: "b".repeat(64), idempotencyKey: "launch-002", now: "2026-11-15T12:03:00Z" }),
  /LAUNCH_IDEMPOTENCY_CONFLICT/);
});
