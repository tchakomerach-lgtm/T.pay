import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCommunityTontineFeeSnapshotForSettlement,
  assertCommunityTontinePermission,
  assertCommunityTontineRoleGrant,
  computeCommunityTontineCommissionPolicyHash,
  assertPromotionCampaignValid,
  attributeCommunityTontinePromotion,
  evaluateCommunityTontinePromotionReward,
  lockCommunityTontineFeeQuote,
  quoteCommunityTontineCommission,
  toTontineFeeSnapshot,
  validateCommunityTontineCommissionPolicy,
  type CommunityTontineCommissionPolicy,
  type CommunityTontinePromotionCampaign
} from "../packages/microfinance/src/community-tontine-commercial-governance.js";

const org = "00000000-0000-4000-8000-000000000001" as never;
const group = "00000000-0000-4000-8000-000000000002" as never;
const admin = "00000000-0000-4000-8000-000000000003" as never;
const approver = "00000000-0000-4000-8000-000000000004" as never;
const member = "00000000-0000-4000-8000-000000000005" as never;
const contribution = "00000000-0000-4000-8000-000000000006" as never;
const now = "2026-11-17T07:00:00.000Z";

function policy(overrides: Partial<CommunityTontineCommissionPolicy> = {}): CommunityTontineCommissionPolicy {
  const value: CommunityTontineCommissionPolicy = {
    id: "00000000-0000-4000-8000-000000000010" as never,
    organizationId: org, groupId: group, version: "v1", transactionLevel: "CONTRIBUTION",
    currency: "XOF", state: "ACTIVE", payer: "SPLIT", memberShareBps: 6000,
    effectiveFrom: "2026-11-01T00:00:00.000Z", createdBy: admin, approvedBy: approver,
    policyHash: "0".repeat(64),
    components: [
      { recipient: "TPAY", rateBps: 100, enabled: true },
      { recipient: "PARTNER", rateBps: 50, enabled: true },
      { recipient: "AGENT", rateBps: 25, enabled: true },
      { recipient: "RESERVE", rateBps: 25, enabled: true },
      { recipient: "TAX", rateBps: 0, enabled: true },
      { recipient: "OPTIONAL_SERVICE", rateBps: 0, enabled: false }
    ],
    ...overrides
  };
  value.policyHash = computeCommunityTontineCommissionPolicyHash(value);
  return value;
}

test("commission quote locks transaction-level fee components and payer split", () => {
  const quote = quoteCommunityTontineCommission({
    id: "00000000-0000-4000-8000-000000000011" as never,
    transactionReference: contribution, policy: policy(), grossAmountMinor: 100_000n,
    currency: "XOF", now, expiresAt: "2026-11-17T07:05:00.000Z"
  });
  assert.equal(quote.totalFeeMinor, 2000n);
  assert.equal(quote.memberFeeMinor, 1200n);
  assert.equal(quote.beneficiaryFeeMinor, 800n);
  const locked = lockCommunityTontineFeeQuote(quote, "2026-11-17T07:02:00.000Z");
  assert.equal(locked.snapshotHash.length, 64);
  const snapshot = toTontineFeeSnapshot(locked, contribution);
  assert.equal(snapshot.tpayFeeMinor, 1000n);
  assert.equal(snapshot.microfinanceFeeMinor, 500n);
  assert.equal(snapshot.agentFeeMinor, 250n);
  assert.equal(snapshot.reserveFeeMinor, 250n);
  assert.equal(snapshot.totalFeeMinor, 2000n);
  assert.equal(snapshot.memberFeeMinor, 1200n);
  assert.equal(snapshot.beneficiaryFeeMinor, 800n);
});

test("accepted commission snapshot must predate payment initiation", () => {
  const quote = quoteCommunityTontineCommission({
    id: "00000000-0000-4000-8000-000000000015" as never,
    transactionReference: contribution, policy: policy(), grossAmountMinor: 10_000n,
    currency: "XOF", now, expiresAt: "2026-11-17T07:05:00.000Z"
  });
  const snapshot = toTontineFeeSnapshot(lockCommunityTontineFeeQuote(quote, "2026-11-17T07:01:00.000Z"), contribution);
  const contributionRow = {
    id: contribution, groupId: group, membershipId: member, scheduledFor: now,
    amountMinor: 10_000n, currency: "XOF", status: "confirmed" as const,
    channel: "mobile_money" as const, idempotencyKey: "tontine-idempotency-key-001"
  };
  const payment = {
    id: "00000000-0000-4000-8000-000000000016" as never, organizationId: org,
    contributionId: contribution, idempotencyKey: contributionRow.idempotencyKey,
    amountMinor: 10_000n, currency: "XOF", provider: "TMONEY", status: "provider_confirmed" as const,
    createdAt: "2026-11-17T07:02:00.000Z", updatedAt: "2026-11-17T07:02:00.000Z"
  };
  assert.doesNotThrow(() => assertCommunityTontineFeeSnapshotForSettlement(snapshot, contributionRow, payment));
  assert.throws(() => assertCommunityTontineFeeSnapshotForSettlement(snapshot, contributionRow, {
    ...payment, createdAt: "2026-11-17T07:00:30.000Z"
  }), /TONTINE_COMMISSION_ACCEPTANCE_AFTER_PAYMENT_INITIATION/);
});

test("commission policy rejects rates above gross and invalid maker-checker", () => {
  assert.throws(() => validateCommunityTontineCommissionPolicy(policy({
    components: [{ recipient: "TPAY", rateBps: 10_001, enabled: true }]
  })), /TONTINE_COMMISSION_RATE_INVALID/);
  assert.throws(() => validateCommunityTontineCommissionPolicy(policy({ approvedBy: admin })),
    /TONTINE_COMMISSION_MAKER_CHECKER_REQUIRED/);
});

test("commission quote cannot be locked after expiry or after payload tampering", () => {
  const quote = quoteCommunityTontineCommission({
    id: "00000000-0000-4000-8000-000000000012" as never,
    transactionReference: contribution, policy: policy(), grossAmountMinor: 50_000n,
    currency: "XOF", now, expiresAt: "2026-11-17T07:05:00.000Z"
  });
  assert.throws(() => lockCommunityTontineFeeQuote(quote, "2026-11-17T07:05:00.000Z"),
    /TONTINE_COMMISSION_QUOTE_EXPIRED/);
  assert.throws(() => lockCommunityTontineFeeQuote({ ...quote, totalFeeMinor: 1n }, "2026-11-17T07:02:00.000Z"),
    /TONTINE_COMMISSION_QUOTE_TAMPERED/);
});

test("contribution fee snapshot is bound to the exact contribution", () => {
  const quote = quoteCommunityTontineCommission({
    id: "00000000-0000-4000-8000-000000000013" as never,
    transactionReference: contribution, policy: policy(), grossAmountMinor: 10_000n,
    currency: "XOF", now, expiresAt: "2026-11-17T07:05:00.000Z"
  });
  const locked = lockCommunityTontineFeeQuote(quote, "2026-11-17T07:01:00.000Z");
  assert.throws(() => toTontineFeeSnapshot(locked, member), /TONTINE_COMMISSION_CONTRIBUTION_BINDING_MISMATCH/);
});

test("group permissions are scoped and temporal grants expire", () => {
  assert.throws(() => assertCommunityTontinePermission({
    role: "COLLECTOR", permission: "payout.approve", organizationId: org, groupId: group,
    actorId: member, now
  }), /TONTINE_PERMISSION_DENIED/);
  assert.throws(() => assertCommunityTontineRoleGrant({
    grantorRole: "COMMUNITY_ADMIN", grantorId: admin, targetId: member,
    targetRole: "PAYOUT_APPROVER", targetPermissions: ["payout.approve"]
  }), /TONTINE_ROLE_REQUIRES_SEPARATE_GOVERNANCE_APPROVAL/);
  assert.throws(() => assertCommunityTontineRoleGrant({
    grantorRole: "COMMUNITY_ADMIN", grantorId: admin, targetId: member,
    targetRole: "MEMBER", targetPermissions: ["payout.approve"]
  }), /TONTINE_ROLE_PRIVILEGE_ESCALATION/);
  assert.throws(() => assertCommunityTontinePermission({
    role: "MEMBER", permission: "payout.approve", organizationId: org, groupId: group,
    actorId: member, now, grants: [{
      id: "00000000-0000-4000-8000-000000000014" as never, organizationId: org, groupId: group,
      actorId: member, permission: "payout.approve", grantedBy: admin,
      validFrom: "2026-11-17T06:00:00.000Z", expiresAt: "2026-11-17T06:59:59.000Z"
    }]
  }), /TONTINE_PERMISSION_DENIED/);
});

function campaign(overrides: Partial<CommunityTontinePromotionCampaign> = {}): CommunityTontinePromotionCampaign {
  return {
    id: "00000000-0000-4000-8000-000000000020" as never, organizationId: org, groupId: group,
    code: "NOV2026", title: "Campagne de lancement", state: "ACTIVE",
    startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2026-12-01T00:00:00.000Z",
    currency: "XOF", rewardMinor: 1000n, maxRedemptions: 10, maxBudgetMinor: 10_000n,
    acceptedRedemptions: 0, committedBudgetMinor: 0n, createdBy: admin, approvedBy: approver,
    allowedChannels: ["LINK", "QR", "USSD", "AGENT", "SOCIAL"], ...overrides
  };
}

test("promotion attribution is separate from reward approval and payment", () => {
  const c = campaign();
  assertPromotionCampaignValid(c);
  const redemption = attributeCommunityTontinePromotion({
    campaign: c, candidateId: member, ambassadorId: admin, channel: "QR", now,
    redemptionId: "00000000-0000-4000-8000-000000000021" as never
  });
  assert.equal(redemption.state, "ATTRIBUTED");
  assert.throws(() => evaluateCommunityTontinePromotionReward(redemption, {
    candidateVerified: true, membershipAccepted: true,
    firstContributionSettledByFinancialCore: false, fraudReviewClear: true
  }), /TONTINE_PROMOTION_REWARD_EVIDENCE_INCOMPLETE/);
  const eligible = evaluateCommunityTontinePromotionReward(redemption, {
    candidateVerified: true, membershipAccepted: true,
    firstContributionSettledByFinancialCore: true,
    firstContributionId: contribution, fraudReviewClear: true
  });
  assert.equal(eligible.state, "PENDING_APPROVAL");
  assert.equal(eligible.idempotencyKey, `community-tontine-promo:${c.id}:${member}`);
});

test("promotion rejects self-referral and underfunded budgets", () => {
  const c = campaign();
  assert.throws(() => attributeCommunityTontinePromotion({
    campaign: c, candidateId: member, ambassadorId: member, channel: "LINK", now,
    redemptionId: "00000000-0000-4000-8000-000000000022" as never
  }), /TONTINE_PROMOTION_SELF_REFERRAL_FORBIDDEN/);
  assert.throws(() => assertPromotionCampaignValid(campaign({ maxBudgetMinor: 100n })),
    /TONTINE_PROMOTION_BUDGET_UNDERFUNDED/);
});
