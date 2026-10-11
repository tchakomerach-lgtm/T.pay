import { createHash } from "node:crypto";
import type { UUID } from "../../domain/src/types.js";
import { authorizePayout, assertPayoutTransition, type PayoutApproval, type PayoutIntent } from "../../finance/src/payout.js";
import type { CommunityTontineMembership } from "./community-tontine.js";

export type TontinePayoutGate = "pending_kyc" | "pending_approval" | "approved" | "blocked";

export interface TontinePayoutContext {
  readonly organizationId: UUID;
  readonly cycleId: string;
  readonly beneficiaryMembershipId: UUID;
  readonly beneficiaryClientId: UUID;
  readonly microfinanceId: UUID;
  readonly destinationRef: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly kycVerified: boolean;
  readonly unresolvedFinancialException: boolean;
  readonly humanApprovalRequired: boolean;
  readonly now: string;
}

export interface TontinePayoutPlan {
  readonly intent: PayoutIntent;
  readonly gate: TontinePayoutGate;
  readonly beneficiaryMembershipId: UUID;
  readonly microfinanceId: UUID;
}

function deterministicPayoutId(context: TontinePayoutContext): UUID {
  const hex = createHash("sha256")
    .update(["tpay:tontine:payout:v1", context.organizationId, context.cycleId, context.beneficiaryMembershipId].join("|"), "utf8")
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16] ?? "8", 16) % 4] ?? "8";
  return `${hex.slice(0,8).join("")}-${hex.slice(8,12).join("")}-${hex.slice(12,16).join("")}-${hex.slice(16,20).join("")}-${hex.slice(20).join("")}` as UUID;
}

export function buildTontinePayoutPlan(
  context: TontinePayoutContext,
  beneficiary: CommunityTontineMembership
): TontinePayoutPlan {
  if (beneficiary.id !== context.beneficiaryMembershipId || beneficiary.clientId !== context.beneficiaryClientId) {
    throw new Error("TONTINE_BENEFICIARY_CONTEXT_MISMATCH");
  }
  if (beneficiary.status !== "active") throw new Error("TONTINE_BENEFICIARY_MEMBER_INACTIVE");
  if (!context.microfinanceId) throw new Error("TONTINE_MICROFINANCE_REQUIRED");
  if (!context.destinationRef.trim()) throw new Error("TONTINE_PAYOUT_DESTINATION_REQUIRED");
  if (context.amountMinor <= 0n) throw new Error("TONTINE_PAYOUT_AMOUNT_INVALID");

  const gate: TontinePayoutGate = context.unresolvedFinancialException
    ? "blocked"
    : !context.kycVerified
      ? "pending_kyc"
      : context.humanApprovalRequired
        ? "pending_approval"
        : "approved";

  const intent: PayoutIntent = {
    payoutId: deterministicPayoutId(context),
    organizationId: context.organizationId,
    cycleId: context.cycleId,
    beneficiaryId: context.beneficiaryClientId,
    amountMinor: context.amountMinor,
    currency: context.currency,
    destinationRef: context.destinationRef,
    state: gate === "blocked" ? "draft" : gate === "pending_kyc" ? "pending_kyc" : gate === "pending_approval" ? "pending_approval" : "approved",
    idempotencyKey: "tontine-payout:" + context.organizationId + ":" + context.cycleId + ":" + context.beneficiaryMembershipId,
    requiresHumanApproval: context.humanApprovalRequired,
    kycVerified: context.kycVerified,
    createdAt: context.now
  };

  return { intent, gate, beneficiaryMembershipId: context.beneficiaryMembershipId, microfinanceId: context.microfinanceId };
}

export function approveTontinePayout(plan: TontinePayoutPlan, approval: PayoutApproval): PayoutIntent {
  if (plan.gate !== "pending_approval") throw new Error("TONTINE_PAYOUT_APPROVAL_NOT_REQUIRED");
  authorizePayout(plan.intent, approval);
  assertPayoutTransition(plan.intent.state, "approved");
  return { ...plan.intent, state: "approved" };
}
