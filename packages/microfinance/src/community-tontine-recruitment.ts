import type { UUID } from "../../domain/src/types.js";

/** Prompt 017: recruitment, referrals and ambassador guardrails. */
export type RecruitmentState = "DISCOVERED" | "APPLIED" | "VERIFYING" | "APPROVED" | "ACTIVE" |
  "REJECTED" | "EXPIRED" | "WITHDRAWN" | "SUSPENDED";
export type CandidateVerification = "NOT_STARTED" | "PENDING" | "VERIFIED" | "FAILED" | "EXPIRED";
export interface RecruitmentPolicy {
  campaignOpen: boolean;
  minimumAgeSatisfied: boolean;
  accountActive: boolean;
  withinEligibleZone: boolean;
  quotaMaximum: number;
  acceptedCount: number;
  allowWaitlist: boolean;
  conflictOfInterest: boolean;
}
export interface RecruitmentCandidate {
  id: UUID;
  groupId: UUID;
  state: RecruitmentState;
  verification: CandidateVerification;
  applicationComplete: boolean;
  appliedAt: string;
  referralId?: UUID;
}
export type EligibilityResult = { eligible: true; waitlisted: false } |
  { eligible: false; waitlisted: true; reasons: string[] } |
  { eligible: false; waitlisted: false; reasons: string[] };

export function evaluateRecruitmentEligibility(policy: RecruitmentPolicy): EligibilityResult {
  const hard: string[] = [];
  if (!policy.campaignOpen) hard.push("CAMPAIGN_CLOSED");
  if (!policy.minimumAgeSatisfied) hard.push("MINIMUM_AGE_NOT_MET");
  if (!policy.accountActive) hard.push("ACCOUNT_NOT_ACTIVE");
  if (!policy.withinEligibleZone) hard.push("OUTSIDE_ELIGIBLE_ZONE");
  if (policy.conflictOfInterest) hard.push("CONFLICT_OF_INTEREST");
  if (!Number.isInteger(policy.quotaMaximum) || policy.quotaMaximum < 1 ||
      !Number.isInteger(policy.acceptedCount) || policy.acceptedCount < 0) hard.push("INVALID_QUOTA");
  if (hard.length) return { eligible: false, waitlisted: false, reasons: hard };
  if (policy.acceptedCount >= policy.quotaMaximum) {
    return policy.allowWaitlist
      ? { eligible: false, waitlisted: true, reasons: ["QUOTA_REACHED"] }
      : { eligible: false, waitlisted: false, reasons: ["QUOTA_REACHED"] };
  }
  return { eligible: true, waitlisted: false };
}

/** Stable, explainable priority: complete file, verified identity, then application time. Never payment or referral volume. */
export function rankRecruitmentWaitlist(candidates: readonly RecruitmentCandidate[]): RecruitmentCandidate[] {
  return [...candidates].sort((a, b) =>
    Number(b.applicationComplete) - Number(a.applicationComplete) ||
    Number(b.verification === "VERIFIED") - Number(a.verification === "VERIFIED") ||
    Date.parse(a.appliedAt) - Date.parse(b.appliedAt) ||
    a.id.localeCompare(b.id)
  );
}

export interface AmbassadorPermissions {
  mayInvite: boolean;
  mayViewSensitiveIdentityData: boolean;
  mayDecideAdmission: boolean;
  mayEditFinancialRules: boolean;
  mayReceiveMemberFunds: boolean;
  mayChangePayoutOrder: boolean;
}
export function assertSafeAmbassadorPermissions(p: AmbassadorPermissions): void {
  if (!p.mayInvite) throw new Error("AMBASSADOR_INVITE_PERMISSION_REQUIRED");
  if (p.mayViewSensitiveIdentityData || p.mayDecideAdmission || p.mayEditFinancialRules ||
      p.mayReceiveMemberFunds || p.mayChangePayoutOrder) throw new Error("AMBASSADOR_PRIVILEGE_ESCALATION");
}

export interface ReferralRewardEvidence {
  candidateVerified: boolean;
  membershipAccepted: boolean;
  firstContributionSettledByFinancialCore: boolean;
  fraudReviewClear: boolean;
}
export function isReferralRewardEligible(e: ReferralRewardEvidence): boolean {
  return e.candidateVerified && e.membershipAccepted &&
    e.firstContributionSettledByFinancialCore && e.fraudReviewClear;
}

/** Prompt 018: pre-launch immutable membership snapshot and explicit participant consent. */
export interface FinalParticipationConsent {
  candidateId: UUID;
  groupId: UUID;
  termsVersion: string;
  contributionAmountMinor: bigint;
  currency: string;
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
  rotationOrderHash: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt?: string;
}
export interface MembershipSnapshotInput {
  groupId: UUID;
  memberIds: readonly UUID[];
  consentRecords: readonly FinalParticipationConsent[];
  rulesVersion: string;
  feePolicyVersion: string;
  rotationOrderHash: string;
}
export interface LockedMembershipSnapshot {
  groupId: UUID;
  memberIds: readonly UUID[];
  rulesVersion: string;
  feePolicyVersion: string;
  rotationOrderHash: string;
  canonicalPayload: string;
  sha256: string;
}
const SHA256 = /^[a-f0-9]{64}$/i;
export function buildMembershipSnapshot(
  input: MembershipSnapshotInput,
  now: string,
  sha256: (canonicalPayload: string) => string
): LockedMembershipSnapshot {
  if (!input.memberIds.length || new Set(input.memberIds).size !== input.memberIds.length) {
    throw new Error("MEMBERSHIP_SET_INVALID");
  }
  if (!input.rulesVersion.trim() || !input.feePolicyVersion.trim() || !SHA256.test(input.rotationOrderHash)) {
    throw new Error("LAUNCH_POLICY_SNAPSHOT_INVALID");
  }
  const time = Date.parse(now);
  for (const memberId of input.memberIds) {
    const c = input.consentRecords.find(x => x.candidateId === memberId && x.groupId === input.groupId);
    if (!c || c.revokedAt || Date.parse(c.expiresAt) <= time || c.contributionAmountMinor <= 0n ||
        !c.currency.trim() || !c.termsVersion.trim() || c.rotationOrderHash !== input.rotationOrderHash) {
      throw new Error("FINAL_PARTICIPATION_CONSENT_INVALID");
    }
  }
  const canonicalPayload = JSON.stringify({
    groupId: input.groupId,
    memberIds: [...input.memberIds].sort(),
    rulesVersion: input.rulesVersion,
    feePolicyVersion: input.feePolicyVersion,
    rotationOrderHash: input.rotationOrderHash
  });
  const digest = sha256(canonicalPayload);
  if (!SHA256.test(digest)) throw new Error("SNAPSHOT_HASH_INVALID");
  return {
    groupId: input.groupId, memberIds: [...input.memberIds], rulesVersion: input.rulesVersion,
    feePolicyVersion: input.feePolicyVersion, rotationOrderHash: input.rotationOrderHash,
    canonicalPayload, sha256: digest
  };
}
