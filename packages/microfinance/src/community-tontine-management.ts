import type { UUID } from "../../domain/src/types.js";

export type CommunityTontineMfRole =
  | "portfolio_manager"
  | "kyc_officer"
  | "collection_supervisor"
  | "settlement_officer"
  | "reconciliation_officer"
  | "risk_officer"
  | "branch_manager";

export type CommunityTontineMfStatus = "invited" | "active" | "suspended" | "revoked";

export interface CommunityTontineMfAccess {
  id: UUID;
  organizationId: UUID;
  tontineGroupId: UUID;
  microfinanceId: UUID;
  role: CommunityTontineMfRole;
  status: CommunityTontineMfStatus;
  grantedBy: UUID;
  createdAt: string;
  expiresAt?: string;
}

export interface CommunityTontineMfPortfolio {
  tontineGroupId: UUID;
  microfinanceId: UUID;
  currency: string;
  activeMembers: number;
  dueContributionMinor: bigint;
  confirmedContributionMinor: bigint;
  pendingContributionMinor: bigint;
  missedContributionCount: number;
  scheduledPayoutMinor: bigint;
  eligiblePayoutMinor: bigint;
  unsettledExceptionCount: number;
}

export interface CommunityTontineMfMemberView {
  membershipId: UUID;
  clientId: UUID;
  selectedMicrofinanceId?: UUID;
  identityStatus: "not_verified" | "verified" | "expired" | "rejected";
  financialServiceStatus: "available" | "restricted" | "suspended";
  contributionStatus: "on_track" | "due" | "pending" | "missed" | "exception";
  payoutStatus: "not_due" | "scheduled" | "eligible" | "blocked" | "paid";
}

export interface CommunityTontineMfSettlementInstruction {
  id: UUID;
  tontineGroupId: UUID;
  microfinanceId: UUID;
  payoutId: UUID;
  beneficiaryClientId: UUID;
  amountMinor: bigint;
  currency: string;
  destinationRef: string;
  requiresHumanApproval: boolean;
  state: "prepared" | "approved" | "submitted" | "provider_pending" | "settled" | "exception";
  createdAt: string;
}

export interface CommunityTontineMfReconciliationItem {
  id: UUID;
  tontineGroupId: UUID;
  microfinanceId: UUID;
  externalReference: string;
  expectedMinor: bigint;
  observedMinor: bigint;
  currency: string;
  state: "open" | "investigating" | "resolved" | "escalated";
  openedAt: string;
}

export function assertMfMayOperateCommunityTontine(access: CommunityTontineMfAccess, now: string): void {
  if (access.status !== "active") throw new Error("COMMUNITY_TONTINE_MF_ACCESS_NOT_ACTIVE");
  if (access.expiresAt && new Date(access.expiresAt).getTime() <= new Date(now).getTime()) {
    throw new Error("COMMUNITY_TONTINE_MF_ACCESS_EXPIRED");
  }
}

export function assertSettlementMayProceed(instruction: CommunityTontineMfSettlementInstruction): void {
  if (!instruction.requiresHumanApproval && instruction.amountMinor > 0n) {
    throw new Error("COMMUNITY_TONTINE_SETTLEMENT_APPROVAL_POLICY_REQUIRED");
  }
  if (!instruction.destinationRef.trim()) throw new Error("COMMUNITY_TONTINE_DESTINATION_REQUIRED");
  if (instruction.state !== "approved") throw new Error("COMMUNITY_TONTINE_SETTLEMENT_NOT_APPROVED");
}

export function assertReconciliationRequired(expectedMinor: bigint, observedMinor: bigint): void {
  if (expectedMinor !== observedMinor) throw new Error("COMMUNITY_TONTINE_RECONCILIATION_REQUIRED");
}
