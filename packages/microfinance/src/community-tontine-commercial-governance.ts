import { createHash } from "node:crypto";
import type { UUID } from "../../domain/src/types.js";
import { calculateCommission } from "../../finance/src/commission.js";
import { money } from "../../finance/src/ledger.js";
import type { TontineContribution, TontineFeeSnapshot } from "./community-tontine.js";
import type { TontinePaymentIntent } from "./tontine-settlement.js";

export type CommunityTontineTransactionLevel =
  | "CONTRIBUTION" | "BENEFICIARY_PAYOUT" | "TRANSFER" | "OPTIONAL_SERVICE";
export type CommunityTontineFeePayer = "MEMBER" | "BENEFICIARY" | "SPLIT";
export type CommunityTontineFeeRecipient =
  | "TPAY" | "PARTNER" | "AGENT" | "RESERVE" | "TAX" | "OPTIONAL_SERVICE";
export type CommunityTontineCommissionPolicyState = "DRAFT" | "APPROVED" | "ACTIVE" | "RETIRED";

export interface CommunityTontineFeeComponentRule {
  recipient: CommunityTontineFeeRecipient;
  rateBps: number;
  minMinor?: bigint;
  maxMinor?: bigint;
  enabled: boolean;
}

export interface CommunityTontineCommissionPolicy {
  id: UUID;
  organizationId: UUID;
  groupId: UUID;
  version: string;
  transactionLevel: CommunityTontineTransactionLevel;
  currency: string;
  state: CommunityTontineCommissionPolicyState;
  payer: CommunityTontineFeePayer;
  memberShareBps: number;
  effectiveFrom: string;
  effectiveUntil?: string;
  components: readonly CommunityTontineFeeComponentRule[];
  createdBy: UUID;
  approvedBy?: UUID;
  policyHash: string;
}

export interface CommunityTontineFeeComponentAmount {
  recipient: CommunityTontineFeeRecipient;
  rateBps: number;
  amountMinor: bigint;
}

export interface CommunityTontineFeeQuote {
  id: UUID;
  organizationId: UUID;
  groupId: UUID;
  transactionReference: UUID;
  transactionLevel: CommunityTontineTransactionLevel;
  policyId: UUID;
  policyVersion: string;
  policyHash: string;
  currency: string;
  grossAmountMinor: bigint;
  components: readonly CommunityTontineFeeComponentAmount[];
  totalFeeMinor: bigint;
  memberFeeMinor: bigint;
  beneficiaryFeeMinor: bigint;
  payer: CommunityTontineFeePayer;
  quotedAt: string;
  expiresAt: string;
  quoteHash: string;
}

export interface LockedCommunityTontineFeeSnapshot extends CommunityTontineFeeQuote {
  acceptedAt: string;
  snapshotHash: string;
}

const HASH = /^[a-f0-9]{64}$/i;
const BPS = 10_000;

function assertIsoDate(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

function canonicalQuote(quote: Omit<CommunityTontineFeeQuote, "quoteHash">): string {
  return JSON.stringify({
    id: quote.id, organizationId: quote.organizationId, groupId: quote.groupId,
    transactionReference: quote.transactionReference, transactionLevel: quote.transactionLevel,
    policyId: quote.policyId, policyVersion: quote.policyVersion, policyHash: quote.policyHash,
    currency: quote.currency, grossAmountMinor: quote.grossAmountMinor.toString(),
    components: quote.components.map(x => ({ recipient: x.recipient, rateBps: x.rateBps, amountMinor: x.amountMinor.toString() })),
    totalFeeMinor: quote.totalFeeMinor.toString(), memberFeeMinor: quote.memberFeeMinor.toString(),
    beneficiaryFeeMinor: quote.beneficiaryFeeMinor.toString(), payer: quote.payer,
    quotedAt: quote.quotedAt, expiresAt: quote.expiresAt
  });
}

export function computeCommunityTontineCommissionPolicyHash(policy: CommunityTontineCommissionPolicy): string {
  const canonical = JSON.stringify({
    id: policy.id, organizationId: policy.organizationId, groupId: policy.groupId,
    version: policy.version, transactionLevel: policy.transactionLevel, currency: policy.currency,
    payer: policy.payer, memberShareBps: policy.memberShareBps,
    effectiveFrom: new Date(policy.effectiveFrom).toISOString(),
    effectiveUntil: policy.effectiveUntil ? new Date(policy.effectiveUntil).toISOString() : null,
    components: [...policy.components].sort((a,b) => a.recipient.localeCompare(b.recipient)).map(c => ({
      recipient: c.recipient, rateBps: c.rateBps, enabled: c.enabled,
      minMinor: c.minMinor?.toString() ?? null, maxMinor: c.maxMinor?.toString() ?? null
    }))
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function validateCommunityTontineCommissionPolicy(policy: CommunityTontineCommissionPolicy): void {
  if (!policy.version.trim() || !policy.groupId || !policy.organizationId) throw new Error("TONTINE_COMMISSION_POLICY_IDENTITY_INVALID");
  if (!/^[A-Z]{3}$/.test(policy.currency)) throw new Error("TONTINE_COMMISSION_CURRENCY_INVALID");
  const effectiveFrom = assertIsoDate(policy.effectiveFrom, "TONTINE_COMMISSION_EFFECTIVE_FROM_INVALID");
  if (policy.effectiveUntil && assertIsoDate(policy.effectiveUntil, "TONTINE_COMMISSION_EFFECTIVE_UNTIL_INVALID") <= effectiveFrom) {
    throw new Error("TONTINE_COMMISSION_EFFECTIVE_WINDOW_INVALID");
  }
  if (!HASH.test(policy.policyHash) || computeCommunityTontineCommissionPolicyHash(policy) !== policy.policyHash) {
    throw new Error("TONTINE_COMMISSION_POLICY_HASH_INVALID");
  }
  if (policy.state === "ACTIVE" && !policy.approvedBy) throw new Error("TONTINE_COMMISSION_APPROVAL_REQUIRED");
  if (policy.approvedBy && policy.approvedBy === policy.createdBy) throw new Error("TONTINE_COMMISSION_MAKER_CHECKER_REQUIRED");
  if (!Number.isInteger(policy.memberShareBps) || policy.memberShareBps < 0 || policy.memberShareBps > BPS) {
    throw new Error("TONTINE_COMMISSION_PAYER_SPLIT_INVALID");
  }
  if (policy.payer === "MEMBER" && policy.memberShareBps !== BPS) throw new Error("TONTINE_COMMISSION_PAYER_SPLIT_INVALID");
  if (policy.payer === "BENEFICIARY" && policy.memberShareBps !== 0) throw new Error("TONTINE_COMMISSION_PAYER_SPLIT_INVALID");
  if (policy.payer === "SPLIT" && (policy.memberShareBps === 0 || policy.memberShareBps === BPS)) {
    throw new Error("TONTINE_COMMISSION_PAYER_SPLIT_INVALID");
  }
  const recipients = new Set<CommunityTontineFeeRecipient>();
  let totalRateBps = 0;
  for (const component of policy.components) {
    if (recipients.has(component.recipient)) throw new Error("TONTINE_COMMISSION_COMPONENT_DUPLICATE");
    recipients.add(component.recipient);
    if (!Number.isInteger(component.rateBps) || component.rateBps < 0 || component.rateBps > BPS) {
      throw new Error("TONTINE_COMMISSION_RATE_INVALID");
    }
    if (component.minMinor !== undefined && component.minMinor < 0n) throw new Error("TONTINE_COMMISSION_MIN_INVALID");
    if (component.maxMinor !== undefined && component.maxMinor < 0n) throw new Error("TONTINE_COMMISSION_MAX_INVALID");
    if (component.minMinor !== undefined && component.maxMinor !== undefined && component.minMinor > component.maxMinor) {
      throw new Error("TONTINE_COMMISSION_BOUNDS_INVALID");
    }
    if (component.enabled) totalRateBps += component.rateBps;
  }
  if (totalRateBps > BPS) throw new Error("TONTINE_COMMISSION_TOTAL_RATE_EXCEEDS_GROSS");
}

export function quoteCommunityTontineCommission(input: {
  id: UUID; transactionReference: UUID; policy: CommunityTontineCommissionPolicy;
  grossAmountMinor: bigint; currency: string; now: string; expiresAt: string;
}): CommunityTontineFeeQuote {
  const { policy } = input;
  validateCommunityTontineCommissionPolicy(policy);
  if (policy.state !== "ACTIVE") throw new Error("TONTINE_COMMISSION_POLICY_NOT_ACTIVE");
  if (input.currency !== policy.currency) throw new Error("TONTINE_COMMISSION_CURRENCY_MISMATCH");
  if (input.grossAmountMinor <= 0n) throw new Error("TONTINE_COMMISSION_GROSS_INVALID");
  const now = assertIsoDate(input.now, "TONTINE_COMMISSION_NOW_INVALID");
  const from = Date.parse(policy.effectiveFrom);
  const until = policy.effectiveUntil ? Date.parse(policy.effectiveUntil) : Number.POSITIVE_INFINITY;
  if (now < from || now >= until) throw new Error("TONTINE_COMMISSION_POLICY_OUTSIDE_EFFECTIVE_WINDOW");
  if (assertIsoDate(input.expiresAt, "TONTINE_COMMISSION_QUOTE_EXPIRY_INVALID") <= now) {
    throw new Error("TONTINE_COMMISSION_QUOTE_EXPIRY_INVALID");
  }
  const components = policy.components.filter(x => x.enabled).map(rule => {
    const amountMinor = calculateCommission(money(input.currency, input.grossAmountMinor), {
      id: policy.id + ":" + rule.recipient,
      name: rule.recipient,
      rateBps: rule.rateBps,
      ...(rule.minMinor !== undefined ? { minMinor: rule.minMinor } : {}),
      ...(rule.maxMinor !== undefined ? { maxMinor: rule.maxMinor } : {}),
      active: true
    }).minor;
    return { recipient: rule.recipient, rateBps: rule.rateBps, amountMinor };
  });
  const totalFeeMinor = components.reduce((sum, x) => sum + x.amountMinor, 0n);
  if (totalFeeMinor > input.grossAmountMinor) throw new Error("TONTINE_COMMISSION_FEE_EXCEEDS_GROSS");
  const memberFeeMinor = totalFeeMinor * BigInt(policy.memberShareBps) / BigInt(BPS);
  const beneficiaryFeeMinor = totalFeeMinor - memberFeeMinor;
  const base = {
    id: input.id, organizationId: policy.organizationId, groupId: policy.groupId,
    transactionReference: input.transactionReference, transactionLevel: policy.transactionLevel,
    policyId: policy.id, policyVersion: policy.version, policyHash: policy.policyHash,
    currency: input.currency, grossAmountMinor: input.grossAmountMinor, components,
    totalFeeMinor, memberFeeMinor, beneficiaryFeeMinor, payer: policy.payer,
    quotedAt: input.now, expiresAt: input.expiresAt
  };
  return { ...base, quoteHash: createHash("sha256").update(canonicalQuote(base)).digest("hex") };
}

export function lockCommunityTontineFeeQuote(quote: CommunityTontineFeeQuote, acceptedAt: string): LockedCommunityTontineFeeSnapshot {
  const accepted = assertIsoDate(acceptedAt, "TONTINE_COMMISSION_ACCEPTANCE_TIME_INVALID");
  if (accepted < Date.parse(quote.quotedAt) || accepted >= Date.parse(quote.expiresAt)) {
    throw new Error("TONTINE_COMMISSION_QUOTE_EXPIRED");
  }
  const { quoteHash: _quoteHash, ...base } = quote;
  const expectedQuoteHash = createHash("sha256").update(canonicalQuote(base)).digest("hex");
  if (!HASH.test(quote.quoteHash) || expectedQuoteHash !== quote.quoteHash) throw new Error("TONTINE_COMMISSION_QUOTE_TAMPERED");
  const snapshotHash = createHash("sha256").update(JSON.stringify({
    quoteHash: quote.quoteHash, acceptedAt
  })).digest("hex");
  return { ...quote, acceptedAt, snapshotHash };
}

/** Convert the locked commercial quote into the canonical settlement snapshot. */
export function toTontineFeeSnapshot(
  snapshot: LockedCommunityTontineFeeSnapshot,
  contributionId: UUID
): TontineFeeSnapshot {
  if (snapshot.transactionLevel !== "CONTRIBUTION" || snapshot.transactionReference !== contributionId) {
    throw new Error("TONTINE_COMMISSION_CONTRIBUTION_BINDING_MISMATCH");
  }
  const amount = (recipient: CommunityTontineFeeRecipient) =>
    snapshot.components.filter(x => x.recipient === recipient).reduce((sum, x) => sum + x.amountMinor, 0n);
  const microfinanceFeeMinor = amount("PARTNER");
  const tpayFeeMinor = amount("TPAY");
  const agentFeeMinor = amount("AGENT");
  const reserveFeeMinor = amount("RESERVE");
  const taxFeeMinor = amount("TAX");
  const optionalServiceFeeMinor = amount("OPTIONAL_SERVICE");
  if (microfinanceFeeMinor + tpayFeeMinor + agentFeeMinor + reserveFeeMinor + taxFeeMinor + optionalServiceFeeMinor !== snapshot.totalFeeMinor) {
    throw new Error("TONTINE_COMMISSION_COMPONENT_TOTAL_MISMATCH");
  }
  return {
    contributionId, microfinanceFeeMinor, tpayFeeMinor, totalFeeMinor: snapshot.totalFeeMinor,
    currency: snapshot.currency, ruleVersion: snapshot.policyVersion, calculatedAt: snapshot.quotedAt,
    agentFeeMinor, reserveFeeMinor, taxFeeMinor, optionalServiceFeeMinor,
    memberFeeMinor: snapshot.memberFeeMinor, beneficiaryFeeMinor: snapshot.beneficiaryFeeMinor,
    payerMode: snapshot.payer, policyId: snapshot.policyId, transactionLevel: snapshot.transactionLevel,
    componentSnapshot: JSON.stringify(snapshot.components.map(x => ({
      recipient: x.recipient, rateBps: x.rateBps, amountMinor: x.amountMinor.toString()
    }))),
    quoteHash: snapshot.quoteHash, snapshotHash: snapshot.snapshotHash, acceptedAt: snapshot.acceptedAt
  };
}

/** Validate that the accepted quote was bound before provider initiation. */
export function assertCommunityTontineFeeSnapshotForSettlement(
  snapshot: TontineFeeSnapshot,
  contribution: TontineContribution,
  paymentIntent: TontinePaymentIntent
): void {
  if (snapshot.contributionId !== contribution.id || paymentIntent.contributionId !== contribution.id) {
    throw new Error("TONTINE_COMMISSION_CONTRIBUTION_BINDING_MISMATCH");
  }
  if (snapshot.currency !== contribution.currency || paymentIntent.currency !== contribution.currency ||
      snapshot.totalFeeMinor < 0n || snapshot.totalFeeMinor > contribution.amountMinor) {
    throw new Error("TONTINE_COMMISSION_SETTLEMENT_CONTEXT_INVALID");
  }
  if (!snapshot.policyId || snapshot.transactionLevel !== "CONTRIBUTION" ||
      !snapshot.acceptedAt || !snapshot.quoteHash || !HASH.test(snapshot.quoteHash) ||
      !snapshot.snapshotHash || !HASH.test(snapshot.snapshotHash)) {
    throw new Error("TONTINE_COMMISSION_ACCEPTED_SNAPSHOT_REQUIRED");
  }
  const acceptedAtEpoch = assertIsoDate(snapshot.acceptedAt, "TONTINE_COMMISSION_ACCEPTANCE_TIME_INVALID");
  const paymentCreatedEpoch = assertIsoDate(paymentIntent.createdAt, "TONTINE_COMMISSION_PAYMENT_TIME_INVALID");
  if (acceptedAtEpoch > paymentCreatedEpoch) throw new Error("TONTINE_COMMISSION_ACCEPTANCE_AFTER_PAYMENT_INITIATION");
  if (!snapshot.componentSnapshot) throw new Error("TONTINE_COMMISSION_COMPONENT_SNAPSHOT_REQUIRED");
  const expectedSnapshotHash = createHash("sha256").update(JSON.stringify({
    quoteHash: snapshot.quoteHash, acceptedAt: snapshot.acceptedAt
  })).digest("hex");
  if (expectedSnapshotHash !== snapshot.snapshotHash) throw new Error("TONTINE_COMMISSION_SNAPSHOT_HASH_MISMATCH");
  {
    let components: unknown;
    try { components = JSON.parse(snapshot.componentSnapshot); } catch { throw new Error("TONTINE_COMMISSION_COMPONENT_SNAPSHOT_INVALID"); }
    if (!Array.isArray(components)) throw new Error("TONTINE_COMMISSION_COMPONENT_SNAPSHOT_INVALID");
    const amounts = new Map<string, bigint>();
    const total = components.reduce((sum: bigint, item: unknown) => {
      if (!item || typeof item !== "object" || !("amountMinor" in item) ||
          typeof (item as {amountMinor?:unknown}).amountMinor !== "string" ||
          !/^[0-9]{1,38}$/.test((item as {amountMinor:string}).amountMinor)) {
        throw new Error("TONTINE_COMMISSION_COMPONENT_SNAPSHOT_INVALID");
      }
      const value = item as {recipient?:unknown;amountMinor:string};
      if (typeof value.recipient !== "string") throw new Error("TONTINE_COMMISSION_COMPONENT_SNAPSHOT_INVALID");
      amounts.set(value.recipient, (amounts.get(value.recipient) ?? 0n) + BigInt(value.amountMinor));
      return sum + BigInt(value.amountMinor);
    }, 0n);
    if (total !== snapshot.totalFeeMinor ||
        (amounts.get("TPAY") ?? 0n) !== snapshot.tpayFeeMinor ||
        (amounts.get("PARTNER") ?? 0n) !== snapshot.microfinanceFeeMinor ||
        (amounts.get("AGENT") ?? 0n) !== (snapshot.agentFeeMinor ?? 0n) ||
        (amounts.get("RESERVE") ?? 0n) !== (snapshot.reserveFeeMinor ?? 0n) ||
        (amounts.get("TAX") ?? 0n) !== (snapshot.taxFeeMinor ?? 0n) ||
        (amounts.get("OPTIONAL_SERVICE") ?? 0n) !== (snapshot.optionalServiceFeeMinor ?? 0n)) {
      throw new Error("TONTINE_COMMISSION_COMPONENT_TOTAL_MISMATCH");
    }
  }
}

export type CommunityTontineAdminRole =
  | "FOUNDER" | "COMMUNITY_ADMIN" | "PRESIDENT" | "TREASURER" | "SECRETARY"
  | "COLLECTOR" | "CONTROLLER" | "MEDIATOR" | "PAYOUT_APPROVER" | "MEMBER";
export type CommunityTontinePermission =
  | "group.manage" | "member.manage" | "member.invite" | "roles.grant"
  | "rules.manage" | "governance.manage" | "governance.vote" | "contribution.read"
  | "contribution.initiate" | "contribution.collect" | "offline.sync" | "payout.prepare"
  | "payout.approve" | "finance.reconcile" | "incident.manage" | "incident.review"
  | "reports.read" | "documents.manage" | "member.self";

const ROLE_PERMISSIONS: Record<CommunityTontineAdminRole, readonly CommunityTontinePermission[]> = {
  FOUNDER: ["group.manage", "member.manage", "member.invite", "roles.grant", "rules.manage", "governance.manage", "reports.read"],
  COMMUNITY_ADMIN: ["group.manage", "member.manage", "member.invite", "roles.grant", "rules.manage", "governance.manage", "incident.manage", "reports.read", "documents.manage"],
  PRESIDENT: ["member.invite", "governance.manage", "governance.vote", "reports.read"],
  TREASURER: ["contribution.read", "payout.prepare", "finance.reconcile", "reports.read"],
  SECRETARY: ["member.manage", "governance.manage", "documents.manage", "reports.read"],
  COLLECTOR: ["contribution.collect", "offline.sync"],
  CONTROLLER: ["contribution.read", "finance.reconcile", "incident.review", "reports.read"],
  MEDIATOR: ["incident.manage", "incident.review"],
  PAYOUT_APPROVER: ["payout.approve", "contribution.read"],
  MEMBER: ["contribution.initiate", "governance.vote", "member.self"]
};

export interface CommunityTontineTemporalGrant {
  id: UUID; organizationId: UUID; groupId: UUID; actorId: UUID;
  permission: CommunityTontinePermission; grantedBy: UUID;
  validFrom: string; expiresAt: string; revokedAt?: string;
}

export function assertCommunityTontineRoleGrant(input: {
  grantorRole: CommunityTontineAdminRole; grantorId: UUID; targetId: UUID;
  targetRole: CommunityTontineAdminRole; targetPermissions: readonly CommunityTontinePermission[];
}): void {
  if (input.grantorId === input.targetId) throw new Error("TONTINE_ROLE_SELF_GRANT_FORBIDDEN");
  if (input.grantorRole !== "FOUNDER" && input.grantorRole !== "COMMUNITY_ADMIN") {
    throw new Error("TONTINE_ROLE_GRANT_FORBIDDEN");
  }
  if (input.targetRole === "FOUNDER" || input.targetRole === "PAYOUT_APPROVER") {
    throw new Error("TONTINE_ROLE_REQUIRES_SEPARATE_GOVERNANCE_APPROVAL");
  }
  if (input.targetPermissions.some(p => p === "payout.approve" || !ROLE_PERMISSIONS[input.grantorRole].includes(p))) {
    throw new Error("TONTINE_ROLE_PRIVILEGE_ESCALATION");
  }
}

export function assertCommunityTontinePermission(input: {
  role: CommunityTontineAdminRole; permission: CommunityTontinePermission;
  organizationId: UUID; groupId: UUID; actorId: UUID; now: string;
  grants?: readonly CommunityTontineTemporalGrant[];
}): void {
  const allowed = ROLE_PERMISSIONS[input.role].includes(input.permission) ||
    (input.grants ?? []).some(g => g.actorId === input.actorId &&
      g.organizationId === input.organizationId && g.groupId === input.groupId &&
      g.permission === input.permission && !g.revokedAt &&
      Date.parse(g.validFrom) <= Date.parse(input.now) && Date.parse(g.expiresAt) > Date.parse(input.now));
  if (!allowed) throw new Error("TONTINE_PERMISSION_DENIED");
}

export type CommunityTontinePromotionState = "DRAFT" | "APPROVED" | "ACTIVE" | "PAUSED" | "ENDED";
export interface CommunityTontinePromotionCampaign {
  id: UUID; organizationId: UUID; groupId: UUID; code: string; title: string;
  state: CommunityTontinePromotionState; startsAt: string; endsAt: string;
  currency: string; rewardMinor: bigint; maxRedemptions: number; maxBudgetMinor: bigint;
  acceptedRedemptions: number; committedBudgetMinor: bigint; createdBy: UUID; approvedBy?: UUID;
  allowedChannels: readonly ("LINK" | "QR" | "USSD" | "AGENT" | "SOCIAL")[];
}
export interface CommunityTontinePromotionRedemption {
  id: UUID; campaignId: UUID; groupId: UUID; candidateId: UUID; ambassadorId?: UUID;
  channel: "LINK" | "QR" | "USSD" | "AGENT" | "SOCIAL"; state: "ATTRIBUTED" | "ELIGIBLE" | "PENDING_APPROVAL" | "PAID" | "REJECTED";
  rewardMinor: bigint; currency: string; idempotencyKey: string;
}
export interface CommunityTontineReferralEvidence {
  candidateVerified: boolean; membershipAccepted: boolean;
  firstContributionSettledByFinancialCore: boolean; firstContributionId?: UUID;
  fraudReviewClear: boolean;
}
export function assertPromotionCampaignValid(c: CommunityTontinePromotionCampaign): void {
  if (!c.code.trim() || !c.title.trim() || !/^[A-Z]{3}$/.test(c.currency)) throw new Error("TONTINE_PROMOTION_IDENTITY_INVALID");
  if (c.state === "ACTIVE" && (!c.approvedBy || c.approvedBy === c.createdBy)) throw new Error("TONTINE_PROMOTION_APPROVAL_REQUIRED");
  if (c.approvedBy && c.approvedBy === c.createdBy) throw new Error("TONTINE_PROMOTION_MAKER_CHECKER_REQUIRED");
  if (Date.parse(c.endsAt) <= Date.parse(c.startsAt)) throw new Error("TONTINE_PROMOTION_WINDOW_INVALID");
  if (!Number.isInteger(c.maxRedemptions) || c.maxRedemptions < 1 || c.acceptedRedemptions < 0 ||
      c.acceptedRedemptions > c.maxRedemptions) throw new Error("TONTINE_PROMOTION_QUOTA_INVALID");
  if (c.rewardMinor < 0n || c.maxBudgetMinor < 0n || c.committedBudgetMinor < 0n ||
      c.committedBudgetMinor > c.maxBudgetMinor) throw new Error("TONTINE_PROMOTION_BUDGET_INVALID");
  if (c.rewardMinor * BigInt(c.maxRedemptions) > c.maxBudgetMinor) throw new Error("TONTINE_PROMOTION_BUDGET_UNDERFUNDED");
}
export function attributeCommunityTontinePromotion(input: {
  campaign: CommunityTontinePromotionCampaign; candidateId: UUID; ambassadorId?: UUID;
  channel: CommunityTontinePromotionRedemption["channel"]; now: string; redemptionId: UUID;
}): CommunityTontinePromotionRedemption {
  const c = input.campaign;
  assertPromotionCampaignValid(c);
  if (c.state !== "ACTIVE" || Date.parse(input.now) < Date.parse(c.startsAt) || Date.parse(input.now) >= Date.parse(c.endsAt)) {
    throw new Error("TONTINE_PROMOTION_NOT_ACTIVE");
  }
  if (!c.allowedChannels.includes(input.channel)) throw new Error("TONTINE_PROMOTION_CHANNEL_NOT_ALLOWED");
  if (c.acceptedRedemptions >= c.maxRedemptions ||
      c.committedBudgetMinor + c.rewardMinor > c.maxBudgetMinor) throw new Error("TONTINE_PROMOTION_QUOTA_OR_BUDGET_EXHAUSTED");
  if (input.ambassadorId === input.candidateId) throw new Error("TONTINE_PROMOTION_SELF_REFERRAL_FORBIDDEN");
  return {
    id: input.redemptionId, campaignId: c.id, groupId: c.groupId, candidateId: input.candidateId,
    ...(input.ambassadorId ? { ambassadorId: input.ambassadorId } : {}),
    channel: input.channel, state: "ATTRIBUTED", rewardMinor: c.rewardMinor, currency: c.currency,
    idempotencyKey: `community-tontine-promo:${c.id}:${input.candidateId}`
  };
}
export function evaluateCommunityTontinePromotionReward(
  redemption: CommunityTontinePromotionRedemption, evidence: CommunityTontineReferralEvidence
): CommunityTontinePromotionRedemption {
  if (!evidence.candidateVerified || !evidence.membershipAccepted ||
      !evidence.firstContributionSettledByFinancialCore || !evidence.firstContributionId || !evidence.fraudReviewClear) {
    throw new Error("TONTINE_PROMOTION_REWARD_EVIDENCE_INCOMPLETE");
  }
  if (redemption.state !== "ATTRIBUTED") throw new Error("TONTINE_PROMOTION_REDEMPTION_STATE_INVALID");
  return { ...redemption, state: "PENDING_APPROVAL" };
}
