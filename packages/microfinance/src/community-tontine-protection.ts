import { createHash } from "node:crypto";
import type { UUID } from "../../domain/src/types.js";

export type TontineProtectionTier = "ESSENTIEL" | "EQUILIBRE" | "RENFORCE";
export type TontineProtectionProposalOrigin = "TPAY" | "MICROFINANCE";
export type TontineProtectionState = "DRAFT" | "APPROVED" | "ACTIVE" | "RETIRED";
export type TontineProtectionRiskBearer = "LICENSED_INSURER";
export interface TontineProtectionTierTerms {
  tier: TontineProtectionTier;
  premiumRateBps: number;
  coveredInstallments: number;
  gracePeriodDays: number;
  waitingPeriodDays: number;
  maxClaimMinor: bigint;
}
export interface CommunityTontineProtectionPolicy {
  id: UUID; organizationId: UUID; groupId: UUID; version: string; currency: string;
  state: TontineProtectionState; proposalOrigin: TontineProtectionProposalOrigin;
  riskBearer: TontineProtectionRiskBearer; insurerPartnerId: UUID;
  insurerLicenseReference: string; insurerContractReference: string;
  insurerLicenseVerified: boolean; insurerContractVerified: boolean;
  effectiveFrom: string; effectiveUntil?: string;
  tiers: readonly TontineProtectionTierTerms[]; createdBy: UUID; approvedBy?: UUID;
  policyHash: string;
}
export interface TontineProtectionEnrollment {
  id: UUID; organizationId: UUID; groupId: UUID; memberId: UUID; policyId: UUID;
  tier: TontineProtectionTier; acceptedAt: string; coverageStartsAt: string;
  consentReference: string; state: "PENDING" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
}
export interface TontineProtectionClaimEvidence {
  scheduledInstallmentMinor: bigint; dueAt: string; coverageStartsAt: string; now: string;
  memberWasCoveredAtDueDate: boolean; premiumSettledForInstallment: boolean;
  memberContactAttempts: number; independentReviews: number;
  confirmedAbandonment: boolean; fraudFlag: boolean;
}
export interface TontineProtectionClaimDecision {
  eligible: boolean; code: string; maximumPayableMinor: bigint;
}
const HASH = /^[a-f0-9]{64}$/i;
const BPS = 10_000;
function validDate(value: string): number {
  const n = Date.parse(value);
  if (!Number.isFinite(n)) throw new Error("TONTINE_PROTECTION_DATE_INVALID");
  return n;
}
function canonical(policy: Omit<CommunityTontineProtectionPolicy, "policyHash">): string {
  return JSON.stringify({
    id: policy.id, organizationId: policy.organizationId, groupId: policy.groupId,
    version: policy.version, currency: policy.currency, proposalOrigin: policy.proposalOrigin,
    riskBearer: policy.riskBearer, insurerPartnerId: policy.insurerPartnerId,
    insurerLicenseReference: policy.insurerLicenseReference,
    insurerContractReference: policy.insurerContractReference,
    insurerLicenseVerified: policy.insurerLicenseVerified, insurerContractVerified: policy.insurerContractVerified,
    effectiveFrom: new Date(policy.effectiveFrom).toISOString(),
    effectiveUntil: policy.effectiveUntil ? new Date(policy.effectiveUntil).toISOString() : null,
    tiers: [...policy.tiers].sort((a,b) => a.tier.localeCompare(b.tier)).map(t => ({
      tier:t.tier,premiumRateBps:t.premiumRateBps,coveredInstallments:t.coveredInstallments,
      gracePeriodDays:t.gracePeriodDays,waitingPeriodDays:t.waitingPeriodDays,maxClaimMinor:t.maxClaimMinor.toString()
    }))
  });
}
export function computeTontineProtectionPolicyHash(policy: CommunityTontineProtectionPolicy): string {
  const { policyHash: _ignored, ...base } = policy;
  return createHash("sha256").update(canonical(base)).digest("hex");
}
export function validateTontineProtectionPolicy(policy: CommunityTontineProtectionPolicy): void {
  if (!policy.organizationId || !policy.groupId || !policy.version.trim()) throw new Error("TONTINE_PROTECTION_IDENTITY_INVALID");
  if (!/^[A-Z]{3}$/.test(policy.currency)) throw new Error("TONTINE_PROTECTION_CURRENCY_INVALID");
  if (!policy.insurerPartnerId || !policy.insurerLicenseReference.trim() || !policy.insurerContractReference.trim()) {
    throw new Error("TONTINE_PROTECTION_LICENSED_INSURER_CONTRACT_REQUIRED");
  }
  const from = validDate(policy.effectiveFrom);
  if (policy.effectiveUntil && validDate(policy.effectiveUntil) <= from) throw new Error("TONTINE_PROTECTION_EFFECTIVE_WINDOW_INVALID");
  if (!HASH.test(policy.policyHash) || computeTontineProtectionPolicyHash(policy) !== policy.policyHash) {
    throw new Error("TONTINE_PROTECTION_POLICY_HASH_INVALID");
  }
  if (policy.approvedBy && policy.approvedBy === policy.createdBy) throw new Error("TONTINE_PROTECTION_MAKER_CHECKER_REQUIRED");
  if (policy.state === "ACTIVE" && !policy.approvedBy) throw new Error("TONTINE_PROTECTION_APPROVAL_REQUIRED");
  if (policy.state === "ACTIVE" && (!policy.insurerLicenseVerified || !policy.insurerContractVerified)) {
    throw new Error("TONTINE_PROTECTION_PARTNER_VERIFICATION_REQUIRED");
  }
  if (policy.tiers.length !== 3 || new Set(policy.tiers.map(t => t.tier)).size !== 3) {
    throw new Error("TONTINE_PROTECTION_TIERS_INCOMPLETE");
  }
  for (const tier of policy.tiers) {
    if (!Number.isInteger(tier.premiumRateBps) || tier.premiumRateBps < 1 || tier.premiumRateBps > 1000) {
      throw new Error("TONTINE_PROTECTION_PREMIUM_RATE_INVALID");
    }
    if (![1,2,3].includes(tier.coveredInstallments) || !Number.isInteger(tier.gracePeriodDays) ||
        tier.gracePeriodDays < 1 || tier.gracePeriodDays > 30 ||
        !Number.isInteger(tier.waitingPeriodDays) || tier.waitingPeriodDays < 0 ||
        tier.waitingPeriodDays > 90 || tier.maxClaimMinor <= 0n) {
      throw new Error("TONTINE_PROTECTION_COVERAGE_TERMS_INVALID");
    }
  }
}
export function quoteTontineProtectionPremium(input: {
  policy: CommunityTontineProtectionPolicy; tier: TontineProtectionTier;
  installmentMinor: bigint; currency: string; now: string;
}): { premiumMinor: bigint; rateBps: number; coverageLimitMinor: bigint; tier: TontineProtectionTier } {
  validateTontineProtectionPolicy(input.policy);
  if (input.policy.state !== "ACTIVE") throw new Error("TONTINE_PROTECTION_POLICY_NOT_ACTIVE");
  if (input.currency !== input.policy.currency || input.installmentMinor <= 0n) throw new Error("TONTINE_PROTECTION_QUOTE_INPUT_INVALID");
  const now = validDate(input.now);
  if (now < validDate(input.policy.effectiveFrom) ||
      (input.policy.effectiveUntil && now >= validDate(input.policy.effectiveUntil))) {
    throw new Error("TONTINE_PROTECTION_POLICY_OUTSIDE_EFFECTIVE_WINDOW");
  }
  const terms = input.policy.tiers.find(t => t.tier === input.tier);
  if (!terms) throw new Error("TONTINE_PROTECTION_TIER_NOT_FOUND");
  const premiumMinor = (input.installmentMinor * BigInt(terms.premiumRateBps) + 9999n) / BigInt(BPS);
  const coverageLimitMinor = terms.maxClaimMinor < input.installmentMinor * BigInt(terms.coveredInstallments)
    ? terms.maxClaimMinor : input.installmentMinor * BigInt(terms.coveredInstallments);
  return { premiumMinor, rateBps: terms.premiumRateBps, coverageLimitMinor, tier: terms.tier };
}
export function evaluateTontineProtectionClaim(input: {
  policy: CommunityTontineProtectionPolicy; tier: TontineProtectionTier; evidence: TontineProtectionClaimEvidence;
}): TontineProtectionClaimDecision {
  validateTontineProtectionPolicy(input.policy);
  const { evidence } = input;
  const terms = input.policy.tiers.find(t => t.tier === input.tier);
  if (!terms) return { eligible:false, code:"TONTINE_PROTECTION_TIER_NOT_FOUND", maximumPayableMinor:0n };
  if (evidence.scheduledInstallmentMinor <= 0n) return { eligible:false, code:"TONTINE_PROTECTION_INSTALLMENT_INVALID", maximumPayableMinor:0n };
  const dueAt = validDate(evidence.dueAt);
  const coverageStartsAt = validDate(evidence.coverageStartsAt);
  const now = validDate(evidence.now);
  const gracePeriodElapsed = now >= dueAt + terms.gracePeriodDays * 86_400_000;
  const waitingPeriodElapsed = now >= coverageStartsAt + terms.waitingPeriodDays * 86_400_000;
  const checks: Array<[boolean,string]> = [
    [evidence.memberWasCoveredAtDueDate,"NOT_COVERED_AT_DUE_DATE"],
    [evidence.premiumSettledForInstallment,"PREMIUM_NOT_SETTLED"],
    [waitingPeriodElapsed,"WAITING_PERIOD_NOT_ELAPSED"],
    [gracePeriodElapsed,"GRACE_PERIOD_NOT_ELAPSED"],
    [evidence.memberContactAttempts >= 2,"INSUFFICIENT_CONTACT_ATTEMPTS"],
    [evidence.independentReviews >= 2,"INDEPENDENT_REVIEW_REQUIRED"],
    [evidence.confirmedAbandonment,"ABANDONMENT_NOT_CONFIRMED"],
    [!evidence.fraudFlag,"FRAUD_REVIEW_BLOCKED"]
  ];
  const failed = checks.find(([ok]) => !ok);
  if (failed) return { eligible:false, code:"TONTINE_PROTECTION_"+failed[1], maximumPayableMinor:0n };
  const tierCap = evidence.scheduledInstallmentMinor * BigInt(terms.coveredInstallments);
  const maximumPayableMinor = [tierCap,terms.maxClaimMinor].reduce((a,b)=>a<b?a:b);
  return { eligible:true, code:"TONTINE_PROTECTION_CLAIM_REQUIRES_INSURER_APPROVAL", maximumPayableMinor };
}
