import type { UUID } from "../../domain/src/types.js";
import { assertMembershipCanContribute, type CommunityTontineGroup, type CommunityTontineMembership, type TontineBeneficiarySlot, type TontineContribution } from "./community-tontine.js";
import { assertPayoutAllowed, type TontineRules } from "./tontine-rules.js";
import { reconcileTontinePayment, type TontineExternalRecord, type TontineInternalRecord } from "./tontine-reconciliation.js";

export interface CommunityTontineRepository {
  findGroup(id: UUID): Promise<CommunityTontineGroup | undefined>;
  findMembership(id: UUID): Promise<CommunityTontineMembership | undefined>;
  findContributionByIdempotency(key: string): Promise<TontineContribution | undefined>;
  insertContribution(contribution: TontineContribution): Promise<void>;
  findBeneficiarySlot(id: UUID): Promise<TontineBeneficiarySlot | undefined>;
  markBeneficiaryPaid(slotId: UUID, paidAt: string): Promise<void>;
}

export interface TontineNotificationPort {
  notify(input: { groupId: UUID; memberId?: UUID; type: string; referenceId: string }): Promise<void>;
}

export interface TontineProviderPort {
  initiate(input: { contribution: TontineContribution }): Promise<{ providerReference: string; status: "pending" | "completed" }>;
}

export interface TontineClock { now(): string; }

export async function createContributionIntent(
  input: Omit<TontineContribution, "status">,
  deps: { repository: CommunityTontineRepository }
): Promise<TontineContribution> {
  const group = await deps.repository.findGroup(input.groupId);
  const membership = await deps.repository.findMembership(input.membershipId);
  if (!group || !membership || membership.groupId !== group.id) throw new Error("TONTINE_CONTEXT_INVALID");
  assertMembershipCanContribute(membership);
  if (input.currency !== group.currency) throw new Error("TONTINE_CURRENCY_MISMATCH");
  if (input.amountMinor < group.minimumAmountMinor) throw new Error("TONTINE_BELOW_MINIMUM");
  if (group.contributionMode === "fixed" && input.amountMinor !== group.fixedAmountMinor) throw new Error("TONTINE_FIXED_AMOUNT_REQUIRED");
  if (group.contributionMode === "goal" && group.targetMinor !== undefined && input.amountMinor > group.targetMinor) throw new Error("TONTINE_GOAL_CONTRIBUTION_EXCEEDS_TARGET");
  const existing = await deps.repository.findContributionByIdempotency(input.idempotencyKey);
  if (existing) return existing;
  const contribution: TontineContribution = { ...input, status: "pending" };
  await deps.repository.insertContribution(contribution);
  return contribution;
}

export async function initiateContributionPayment(
  contribution: TontineContribution,
  deps: { provider: TontineProviderPort; notifications: TontineNotificationPort }
): Promise<{ providerReference: string; status: "pending" | "completed" }> {
  const result = await deps.provider.initiate({ contribution });
  await deps.notifications.notify({
    groupId: contribution.groupId,
    memberId: contribution.id as never,
    type: result.status === "completed" ? "tontine.contribution.confirmed" : "tontine.contribution.pending",
    referenceId: contribution.id
  });
  return result;
}

export async function settleBeneficiaryPayout(
  group: CommunityTontineGroup,
  slot: TontineBeneficiarySlot,
  rules: TontineRules,
  input: { kycVerified: boolean; humanApproved: boolean; now?: string },
  deps: { repository: CommunityTontineRepository; notifications: TontineNotificationPort; clock: TontineClock }
): Promise<void> {
  assertPayoutAllowed(group, slot, rules, input.kycVerified, input.humanApproved);
  await deps.repository.markBeneficiaryPaid(slot.id, input.now ?? deps.clock.now());
  await deps.notifications.notify({
    groupId: group.id,
    type: "tontine.beneficiary.paid",
    referenceId: slot.id
  });
}

export function reconcileExternalPayment(
  external: TontineExternalRecord | undefined,
  internal: TontineInternalRecord | undefined
) {
  return reconcileTontinePayment(external, internal);
}
