import type { UUID } from "../../domain/src/types.js";

export type TontineFrequency = "daily" | "weekly" | "monthly";
export type TontineContributionMode = "fixed" | "variable" | "goal";
export type TontineGovernanceMode = "founder_managed" | "member_vote";
export type TontineGroupStatus = "draft" | "pending_review" | "active" | "paused" | "completed" | "cancelled";
export type TontineMemberRole = "founder" | "member" | "treasurer" | "collector" | "supervisor";
export type TontineMembershipStatus = "pending" | "active" | "suspended" | "exited";
export type TontineBeneficiaryStatus = "scheduled" | "eligible" | "paid" | "deferred" | "blocked";

export interface CommunityTontineGroup {
  id: UUID;
  organizationId?: UUID;
  name: string;
  countryCode: string;
  currency: string;
  frequency: TontineFrequency;
  contributionMode: TontineContributionMode;
  targetMinor?: bigint;
  fixedAmountMinor?: bigint;
  /**
   * Configured by the tontine creator/operator.
   * There is intentionally no hard-coded product minimum here.
   * Any regulatory, partner or campaign floor must be supplied as a separate policy.
   */
  minimumAmountMinor: bigint;
  cycleNumber: number;
  maxMembers?: number;
  governance: TontineGovernanceMode;
  partnerMicrofinanceId?: UUID;
  status: TontineGroupStatus;
  createdBy: UUID;
  createdAt: string;
}

export interface CommunityTontineMembership {
  id: UUID;
  groupId: UUID;
  clientId: UUID;
  role: TontineMemberRole;
  status: TontineMembershipStatus;
  joinedAt: string;
  exitedAt?: string;
  selectedMicrofinanceId?: UUID;
}

export interface TontineBeneficiarySlot {
  id: UUID;
  groupId: UUID;
  cycleNumber: number;
  sequence: number;
  beneficiaryMemberId: UUID;
  amountTargetMinor: bigint;
  status: TontineBeneficiaryStatus;
  scheduledFor: string;
  paidAt?: string;
}

export interface TontineContribution {
  id: UUID;
  groupId: UUID;
  membershipId: UUID;
  scheduledFor: string;
  amountMinor: bigint;
  currency: string;
  status: "scheduled" | "pending" | "confirmed" | "missed" | "reversed";
  channel: "agent" | "wallet" | "mobile_money" | "microfinance" | "cash_point" | "ussd";
  idempotencyKey: string;
  providerReference?: string;
  collectionLocation?: { latitude: number; longitude: number; accuracyMeters?: number };
  offlineEnvelopeId?: string;
}

export interface TontineFeeSnapshot {
  contributionId: UUID;
  microfinanceFeeMinor: bigint;
  tpayFeeMinor: bigint;
  totalFeeMinor: bigint;
  currency: string;
  ruleVersion: string;
  calculatedAt: string;
}

export function validateCommunityTontine(group: CommunityTontineGroup): void {
  if (!group.name.trim() || group.name.length > 160) throw new Error("TONTINE_GROUP_NAME_INVALID");
  if (group.minimumAmountMinor <= 0n) throw new Error("TONTINE_MINIMUM_INVALID");
  if (group.contributionMode === "fixed" && (!group.fixedAmountMinor || group.fixedAmountMinor < group.minimumAmountMinor)) {
    throw new Error("TONTINE_FIXED_AMOUNT_INVALID");
  }
  if (group.contributionMode === "goal" && (!group.targetMinor || group.targetMinor <= 0n)) {
    throw new Error("TONTINE_TARGET_INVALID");
  }
  if (group.maxMembers !== undefined && group.maxMembers < 2) throw new Error("TONTINE_MAX_MEMBERS_INVALID");
  if (!/^[A-Z]{2}$/.test(group.countryCode)) throw new Error("TONTINE_COUNTRY_INVALID");
  if (!/^[A-Z]{3}$/.test(group.currency)) throw new Error("TONTINE_CURRENCY_INVALID");
}

export function assertMembershipCanContribute(member: CommunityTontineMembership): void {
  if (member.status !== "active") throw new Error("TONTINE_MEMBER_NOT_ACTIVE");
}

export function assertBeneficiaryEligible(slot: TontineBeneficiarySlot): void {
  if (slot.status !== "eligible" && slot.status !== "scheduled") throw new Error("TONTINE_BENEFICIARY_NOT_ELIGIBLE");
}
