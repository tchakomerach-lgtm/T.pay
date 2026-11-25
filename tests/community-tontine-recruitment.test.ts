import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMembershipSnapshot, evaluateRecruitmentEligibility, isReferralRewardEligible,
  rankRecruitmentWaitlist, assertSafeAmbassadorPermissions,
  type RecruitmentCandidate, type FinalParticipationConsent
} from "../packages/microfinance/src/community-tontine-recruitment.js";
import type { UUID } from "../packages/domain/src/types.js";

const id = (s: string) => s as UUID;
const group = id("group-1");
const hash = "a".repeat(64);
const candidates: RecruitmentCandidate[] = [
  { id: id("late"), groupId: group, state: "APPLIED", verification: "VERIFIED", applicationComplete: true, appliedAt: "2026-11-15T10:00:00Z" },
  { id: id("early-incomplete"), groupId: group, state: "APPLIED", verification: "VERIFIED", applicationComplete: false, appliedAt: "2026-11-15T08:00:00Z" },
  { id: id("early-complete"), groupId: group, state: "APPLIED", verification: "PENDING", applicationComplete: true, appliedAt: "2026-11-15T08:00:00Z" }
];

test("quota overflow goes to waitlist only when policy explicitly allows it", () => {
  assert.deepEqual(evaluateRecruitmentEligibility({
    campaignOpen: true, minimumAgeSatisfied: true, accountActive: true, withinEligibleZone: true,
    quotaMaximum: 10, acceptedCount: 10, allowWaitlist: true, conflictOfInterest: false
  }), { eligible: false, waitlisted: true, reasons: ["QUOTA_REACHED"] });
});

test("waitlist ranks complete applications, verified identity, then application time", () => {
  assert.deepEqual(rankRecruitmentWaitlist(candidates).map(x => x.id),
    [id("late"), id("early-complete"), id("early-incomplete")]);
});

test("ambassadors cannot decide admission, see sensitive identity data or handle funds", () => {
  assert.throws(() => assertSafeAmbassadorPermissions({
    mayInvite: true, mayViewSensitiveIdentityData: false, mayDecideAdmission: true,
    mayEditFinancialRules: false, mayReceiveMemberFunds: false, mayChangePayoutOrder: false
  }), /AMBASSADOR_PRIVILEGE_ESCALATION/);
});

test("referral reward requires verified accepted member and settled first contribution", () => {
  assert.equal(isReferralRewardEligible({
    candidateVerified: true, membershipAccepted: true,
    firstContributionSettledByFinancialCore: false, fraudReviewClear: true
  }), false);
  assert.equal(isReferralRewardEligible({
    candidateVerified: true, membershipAccepted: true,
    firstContributionSettledByFinancialCore: true, fraudReviewClear: true
  }), true);
});

test("membership snapshot requires every member's active consent and stable rotation hash", () => {
  const consent: FinalParticipationConsent = {
    candidateId: id("member-1"), groupId: group, termsVersion: "terms-v1",
    contributionAmountMinor: 250000n, currency: "XOF", cadence: "WEEKLY",
    rotationOrderHash: hash, grantedAt: "2026-11-15T00:00:00Z",
    expiresAt: "2026-12-15T00:00:00Z"
  };
  const snapshot = buildMembershipSnapshot({
    groupId: group, memberIds: [id("member-1")], consentRecords: [consent],
    rulesVersion: "rules-v1", feePolicyVersion: "fees-v1", rotationOrderHash: hash
  }, "2026-11-15T12:00:00Z", () => "b".repeat(64));
  assert.equal(snapshot.sha256, "b".repeat(64));
  assert.throws(() => buildMembershipSnapshot({
    groupId: group, memberIds: [id("member-1")], consentRecords: [{ ...consent, revokedAt: "2026-11-15T11:00:00Z" }],
    rulesVersion: "rules-v1", feePolicyVersion: "fees-v1", rotationOrderHash: hash
  }, "2026-11-15T12:00:00Z", () => "b".repeat(64)), /FINAL_PARTICIPATION_CONSENT_INVALID/);
});
