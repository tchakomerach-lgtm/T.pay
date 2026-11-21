import type { UUID } from "../../domain/src/types.js";

/**
 * Admission and launch control plane for the independent community tontine.
 * A microfinance partner may attest evidence; only the community administrator
 * may decide membership. This module deliberately does not write the ledger.
 */

export type CandidateState =
  | "DISCOVERED" | "APPLIED" | "VERIFYING" | "APPROVED" | "ACTIVE"
  | "REJECTED" | "EXPIRED" | "WITHDRAWN" | "SUSPENDED";
export type AdmissionDecision = "ACCEPT" | "REJECT" | "REQUEST_MORE_INFORMATION" | "HOLD";
export type MatchResult = "MATCH" | "PARTIAL_MATCH" | "MISMATCH" | "UNABLE_TO_VERIFY";
export type AttestationStatus = "PENDING" | "VALID" | "EXPIRED" | "REVOKED" | "SUPERSEDED" | "DISPUTED";
export type TrustLevel = 0 | 1 | 2 | 3 | 4;
export type LaunchState =
  | "DRAFT" | "RECRUITING" | "VERIFYING" | "MEMBERSHIP_FINALIZING"
  | "READY_TO_START" | "ARMED" | "ACTIVE" | "PAUSED" | "SUSPENDED"
  | "UNDER_REVIEW" | "EMERGENCY_HOLD";

export interface Candidate {
  id: UUID;
  groupId: UUID;
  state: CandidateState;
  appliedAt: string;
  membershipLockAt?: string;
  decision?: AdmissionDecision;
  decisionBy?: UUID;
  decisionReason?: string;
}

export interface ThirdPartyTrustAttestation {
  id: UUID;
  candidateId: UUID;
  groupId: UUID;
  partnerId: UUID;
  agentId: UUID;
  verificationRef: string;
  match: MatchResult;
  status: AttestationStatus;
  trustLevel: TrustLevel;
  issuedAt: string;
  expiresAt: string;
  signature: string;
  revokedAt?: string;
}

export interface ConsentGrant {
  candidateId: UUID;
  groupId: UUID;
  partnerId: UUID;
  purpose: "IDENTITY_VERIFICATION" | "FINANCIAL_PROFILE" | "TRUST_PASSPORT";
  grantedAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface AdmissionActor {
  id: UUID;
  role: "COMMUNITY_ADMIN" | "MICROFINANCE_AGENT" | "SUPER_ADMIN";
}

export interface LaunchReadiness {
  activeMembers: number;
  minimumMembers: number;
  allMembershipsDecided: boolean;
  allRequiredIdentityChecksValid: boolean;
  allFinalConsentsRecorded: boolean;
  contributionRulesVersion: string;
  rotationSnapshotHash: string;
  feePolicyVersion: string;
  payoutOrderLocked: boolean;
  paymentRailsReady: boolean;
  unresolvedCriticalIncidents: number;
  securityPreflightPassed: boolean;
}

export interface LaunchAggregate {
  groupId: UUID;
  state: LaunchState;
  configHash?: string;
  armedAt?: string;
  activatedAt?: string;
  idempotencyKey?: string;
}

const TERMINAL_CANDIDATE_STATES = new Set<CandidateState>(["REJECTED", "EXPIRED", "WITHDRAWN"]);
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

export function assertConsentValid(consent: ConsentGrant, now: string): void {
  const time = Date.parse(now);
  if (!Number.isFinite(time) || Date.parse(consent.expiresAt) <= time) throw new Error("CONSENT_EXPIRED");
  if (consent.revokedAt) throw new Error("CONSENT_REVOKED");
}

export function assertAttestationValid(
  attestation: ThirdPartyTrustAttestation,
  expected: { candidateId: UUID; groupId: UUID; partnerId: UUID },
  now: string,
  verifySignature: (attestation: ThirdPartyTrustAttestation) => boolean
): void {
  if (attestation.candidateId !== expected.candidateId || attestation.groupId !== expected.groupId ||
      attestation.partnerId !== expected.partnerId) throw new Error("ATTESTATION_SCOPE_MISMATCH");
  if (attestation.status !== "VALID") throw new Error("ATTESTATION_NOT_VALID");
  if (Date.parse(attestation.expiresAt) <= Date.parse(now)) throw new Error("ATTESTATION_EXPIRED");
  if (!attestation.signature.trim() || !verifySignature(attestation)) throw new Error("ATTESTATION_SIGNATURE_INVALID");
  if (attestation.match !== "MATCH") throw new Error("IDENTITY_MATCH_REQUIRED");
  if (attestation.trustLevel < 1 || attestation.trustLevel > 3) throw new Error("ATTESTATION_TRUST_LEVEL_INVALID");
}

export function decideMembership(
  candidate: Candidate,
  actor: AdmissionActor,
  decision: AdmissionDecision,
  reason: string,
  evidence: { consent: ConsentGrant; attestation: ThirdPartyTrustAttestation; now: string;
    verifySignature: (attestation: ThirdPartyTrustAttestation) => boolean }
): Candidate {
  if (actor.role !== "COMMUNITY_ADMIN") throw new Error("COMMUNITY_ADMIN_DECISION_REQUIRED");
  if (TERMINAL_CANDIDATE_STATES.has(candidate.state) || candidate.state === "ACTIVE") {
    throw new Error("CANDIDATE_STATE_TERMINAL");
  }
  if (!reason.trim()) throw new Error("ADMISSION_DECISION_REASON_REQUIRED");
  assertConsentValid(evidence.consent, evidence.now);
  if (evidence.consent.candidateId !== candidate.id || evidence.consent.groupId !== candidate.groupId) {
    throw new Error("CONSENT_SCOPE_MISMATCH");
  }
  if (decision === "ACCEPT") {
    assertAttestationValid(evidence.attestation, {
      candidateId: candidate.id, groupId: candidate.groupId, partnerId: evidence.consent.partnerId
    }, evidence.now, evidence.verifySignature);
  }
  const state: CandidateState = decision === "ACCEPT" ? "APPROVED"
    : decision === "REJECT" ? "REJECTED"
    : decision === "HOLD" ? "VERIFYING" : "APPLIED";
  return { ...candidate, state, decision, decisionBy: actor.id, decisionReason: reason.trim() };
}

export function assertCandidateCanActivate(candidate: Candidate, now: string): void {
  if (candidate.state !== "APPROVED") throw new Error("CANDIDATE_NOT_APPROVED");
  if (candidate.membershipLockAt && Date.parse(candidate.membershipLockAt) <= Date.parse(now)) {
    throw new Error("MEMBERSHIP_LOCKED");
  }
}

export function evaluateLaunchReadiness(readiness: LaunchReadiness): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!Number.isInteger(readiness.activeMembers) || readiness.activeMembers < readiness.minimumMembers) blockers.push("MINIMUM_MEMBER_COUNT_NOT_MET");
  if (!readiness.allMembershipsDecided) blockers.push("MEMBERSHIP_DECISIONS_INCOMPLETE");
  if (!readiness.allRequiredIdentityChecksValid) blockers.push("IDENTITY_CHECKS_INCOMPLETE");
  if (!readiness.allFinalConsentsRecorded) blockers.push("FINAL_PARTICIPATION_CONSENTS_INCOMPLETE");
  if (!readiness.contributionRulesVersion.trim()) blockers.push("CONTRIBUTION_RULES_NOT_VERSIONED");
  if (!HASH_PATTERN.test(readiness.rotationSnapshotHash)) blockers.push("ROTATION_SNAPSHOT_INVALID");
  if (!readiness.feePolicyVersion.trim()) blockers.push("FEE_POLICY_NOT_VERSIONED");
  if (!readiness.payoutOrderLocked) blockers.push("PAYOUT_ORDER_NOT_LOCKED");
  if (!readiness.paymentRailsReady) blockers.push("PAYMENT_RAILS_NOT_READY");
  if (readiness.unresolvedCriticalIncidents > 0) blockers.push("CRITICAL_INCIDENTS_OPEN");
  if (!readiness.securityPreflightPassed) blockers.push("SECURITY_PREFLIGHT_FAILED");
  return { ready: blockers.length === 0, blockers };
}

export function armTontineLaunch(
  aggregate: LaunchAggregate,
  readiness: LaunchReadiness,
  input: { configHash: string; idempotencyKey: string; now: string }
): LaunchAggregate {
  if (aggregate.state !== "READY_TO_START") throw new Error("TONTINE_NOT_READY_TO_ARM");
  const result = evaluateLaunchReadiness(readiness);
  if (!result.ready) throw new Error(`LAUNCH_BLOCKED:${result.blockers.join(",")}`);
  if (!HASH_PATTERN.test(input.configHash)) throw new Error("LAUNCH_CONFIG_HASH_INVALID");
  if (!input.idempotencyKey.trim()) throw new Error("LAUNCH_IDEMPOTENCY_KEY_REQUIRED");
  if (aggregate.configHash && aggregate.configHash !== input.configHash) throw new Error("LAUNCH_CONFIG_CHANGED");
  if (aggregate.idempotencyKey && aggregate.idempotencyKey !== input.idempotencyKey) throw new Error("LAUNCH_IDEMPOTENCY_CONFLICT");
  return { ...aggregate, state: "ARMED", configHash: input.configHash, idempotencyKey: input.idempotencyKey, armedAt: input.now };
}

export function activateArmedTontine(
  aggregate: LaunchAggregate,
  input: { configHash: string; idempotencyKey: string; now: string }
): LaunchAggregate {
  if (aggregate.state === "ACTIVE") {
    if (aggregate.configHash !== input.configHash) throw new Error("LAUNCH_CONFIG_CHANGED");
    if (aggregate.idempotencyKey !== input.idempotencyKey) throw new Error("LAUNCH_IDEMPOTENCY_CONFLICT");
    return aggregate;
  }
  if (aggregate.state !== "ARMED") throw new Error("TONTINE_NOT_ARMED");
  if (aggregate.configHash !== input.configHash) throw new Error("LAUNCH_CONFIG_CHANGED");
  if (aggregate.idempotencyKey !== input.idempotencyKey) throw new Error("LAUNCH_IDEMPOTENCY_CONFLICT");
  return { ...aggregate, state: "ACTIVE", activatedAt: input.now };
}
