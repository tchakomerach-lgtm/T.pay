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
export type CommunityTontineMfCapability =
  | "portfolio.read" | "member.read" | "collection.manage" | "kyc.review"
  | "payout.prepare" | "payout.approve" | "reconciliation.manage" | "risk.review";

const ROLE_CAPABILITIES: Record<CommunityTontineMfRole, readonly CommunityTontineMfCapability[]> = {
  portfolio_manager: ["portfolio.read", "member.read"],
  kyc_officer: ["portfolio.read", "member.read", "kyc.review"],
  collection_supervisor: ["portfolio.read", "member.read", "collection.manage"],
  settlement_officer: ["portfolio.read", "member.read", "payout.prepare"],
  reconciliation_officer: ["portfolio.read", "reconciliation.manage"],
  risk_officer: ["portfolio.read", "member.read", "risk.review"],
  branch_manager: ["portfolio.read", "member.read", "collection.manage", "kyc.review", "payout.prepare", "reconciliation.manage", "risk.review"]
};

export interface CommunityTontineMfAccess {
  id: UUID; organizationId: UUID; tontineGroupId: UUID; microfinanceId: UUID;
  role: CommunityTontineMfRole; status: CommunityTontineMfStatus; grantedBy: UUID;
  createdAt: string; expiresAt?: string;
}
export interface CommunityTontineMfPortfolio {
  tontineGroupId: UUID; microfinanceId: UUID; currency: string; activeMembers: number;
  dueContributionMinor: bigint; confirmedContributionMinor: bigint; pendingContributionMinor: bigint;
  missedContributionCount: number; scheduledPayoutMinor: bigint; eligiblePayoutMinor: bigint;
  unsettledExceptionCount: number;
}
export interface CommunityTontineMfMemberView {
  membershipId: UUID; clientId: UUID; selectedMicrofinanceId?: UUID;
  identityStatus: "not_verified" | "verified" | "expired" | "rejected";
  financialServiceStatus: "available" | "restricted" | "suspended";
  contributionStatus: "on_track" | "due" | "pending" | "missed" | "exception";
  payoutStatus: "not_due" | "scheduled" | "eligible" | "blocked" | "paid";
}
export interface CommunityTontineMfSettlementInstruction {
  id: UUID; tontineGroupId: UUID; microfinanceId: UUID; payoutId: UUID; beneficiaryClientId: UUID;
  amountMinor: bigint; currency: string; destinationRef: string; requiresHumanApproval: boolean;
  state: "prepared" | "approved" | "submitted" | "provider_pending" | "settled" | "exception"; createdAt: string;
}
export interface CommunityTontineMfReconciliationItem {
  id: UUID; tontineGroupId: UUID; microfinanceId: UUID; externalReference: string;
  expectedMinor: bigint; observedMinor: bigint; currency: string;
  state: "open" | "investigating" | "resolved" | "escalated"; openedAt: string;
}
export interface CommunityTontineMfSettlementApprovalPolicy {
  humanApprovalRequired: boolean; lowRiskAutomationEnabled: boolean; maxAutomatedAmountMinor: bigint;
}
export const DEFAULT_COMMUNITY_TONTINE_MF_SETTLEMENT_POLICY: CommunityTontineMfSettlementApprovalPolicy = {
  humanApprovalRequired: true, lowRiskAutomationEnabled: false, maxAutomatedAmountMinor: 0n
};

export function assertMfMayOperateCommunityTontine(access: CommunityTontineMfAccess, now: string): void {
  if (access.status !== "active") throw new Error("COMMUNITY_TONTINE_MF_ACCESS_NOT_ACTIVE");
  if (access.expiresAt && new Date(access.expiresAt).getTime() <= new Date(now).getTime()) throw new Error("COMMUNITY_TONTINE_MF_ACCESS_EXPIRED");
}
export function assertMfScope(access: CommunityTontineMfAccess, organizationId: UUID, tontineGroupId: UUID, microfinanceId: UUID, now: string): void {
  assertMfMayOperateCommunityTontine(access, now);
  if (access.organizationId !== organizationId) throw new Error("COMMUNITY_TONTINE_MF_ORGANIZATION_SCOPE_DENIED");
  if (access.tontineGroupId !== tontineGroupId) throw new Error("COMMUNITY_TONTINE_MF_GROUP_SCOPE_DENIED");
  if (access.microfinanceId !== microfinanceId) throw new Error("COMMUNITY_TONTINE_MF_PARTNER_SCOPE_DENIED");
}
export function assertMfCapability(access: CommunityTontineMfAccess, capability: CommunityTontineMfCapability): void {
  if (!ROLE_CAPABILITIES[access.role].includes(capability)) throw new Error("COMMUNITY_TONTINE_MF_CAPABILITY_DENIED");
}
export function canAutomateSettlement(policy: CommunityTontineMfSettlementApprovalPolicy, amountMinor: bigint): boolean {
  return !policy.humanApprovalRequired && policy.lowRiskAutomationEnabled && amountMinor > 0n && amountMinor <= policy.maxAutomatedAmountMinor;
}
export function assertSettlementMayProceed(instruction: CommunityTontineMfSettlementInstruction, policy: CommunityTontineMfSettlementApprovalPolicy = DEFAULT_COMMUNITY_TONTINE_MF_SETTLEMENT_POLICY): void {
  if (!instruction.destinationRef.trim()) throw new Error("COMMUNITY_TONTINE_DESTINATION_REQUIRED");
  if (instruction.amountMinor <= 0n) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_AMOUNT_INVALID");
  if (instruction.state !== "approved") throw new Error("COMMUNITY_TONTINE_SETTLEMENT_NOT_APPROVED");
  if (policy.humanApprovalRequired && !instruction.requiresHumanApproval) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_HUMAN_APPROVAL_REQUIRED");
  if (!instruction.requiresHumanApproval && !canAutomateSettlement(policy, instruction.amountMinor)) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_AUTOMATION_NOT_ALLOWED");
}
export function assertReconciliationRequired(expectedMinor: bigint, observedMinor: bigint): void {
  if (expectedMinor !== observedMinor) throw new Error("COMMUNITY_TONTINE_RECONCILIATION_REQUIRED");
}
