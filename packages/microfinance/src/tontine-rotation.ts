import type { UUID } from "../../domain/src/types.js";
import type { CommunityTontineGroup, CommunityTontineMembership, TontineBeneficiarySlot, TontineContribution, TontineFeeSnapshot } from "./community-tontine.js";

export interface TontineRotationPolicy {
  readonly allowRepeatOnlyAfterFullRound: boolean;
  readonly requireActiveMembership: boolean;
}

export interface BeneficiarySelection {
  readonly memberId: UUID;
  readonly sequence: number;
  readonly reason: "rotation";
}

export interface TontinePoolSettlement {
  readonly currency: string;
  readonly grossContributionsMinor: bigint;
  readonly totalFeesMinor: bigint;
  readonly netBeneficiaryAmountMinor: bigint;
  readonly confirmedContributionCount: number;
}

function memberOrder(memberships: readonly CommunityTontineMembership[]): CommunityTontineMembership[] {
  return memberships.filter(m => m.status === "active").slice()
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));
}

export function selectRotatingBeneficiary(
  group: CommunityTontineGroup,
  memberships: readonly CommunityTontineMembership[],
  previouslyPaidMemberIds: ReadonlySet<UUID>,
  policy: TontineRotationPolicy = { allowRepeatOnlyAfterFullRound: true, requireActiveMembership: true }
): BeneficiarySelection {
  if (memberships.some(m => m.groupId !== group.id)) throw new Error("TONTINE_ROTATION_GROUP_MISMATCH");
  const active = memberOrder(memberships);
  if (active.length < 2) throw new Error("TONTINE_ROTATION_REQUIRES_TWO_ACTIVE_MEMBERS");
  const eligible = policy.requireActiveMembership ? active : memberships.slice();
  const fresh = eligible.filter(m => !previouslyPaidMemberIds.has(m.id));
  const pool = policy.allowRepeatOnlyAfterFullRound && fresh.length > 0 ? fresh : eligible;
  const index = fresh.length > 0 ? 0 : Math.max(0, group.cycleNumber - 1) % pool.length;
  const selected = pool[index];
  if (!selected) throw new Error("TONTINE_NO_ELIGIBLE_BENEFICIARY");
  return { memberId: selected.id, sequence: group.cycleNumber, reason: "rotation" };
}

export function buildBeneficiarySlot(input: {
  id: UUID;
  group: CommunityTontineGroup;
  memberships: readonly CommunityTontineMembership[];
  previouslyPaidMemberIds: ReadonlySet<UUID>;
  scheduledFor: string;
}): TontineBeneficiarySlot {
  const selection = selectRotatingBeneficiary(input.group, input.memberships, input.previouslyPaidMemberIds);
  return {
    id: input.id, groupId: input.group.id, cycleNumber: input.group.cycleNumber,
    sequence: selection.sequence, beneficiaryMemberId: selection.memberId,
    amountTargetMinor: 0n, status: "scheduled", scheduledFor: input.scheduledFor
  };
}

export function calculateTontinePool(input: {
  group: CommunityTontineGroup;
  contributions: readonly TontineContribution[];
  fees: readonly TontineFeeSnapshot[];
}): TontinePoolSettlement {
  const confirmed = input.contributions.filter(c =>
    c.groupId === input.group.id && c.status === "confirmed" && c.currency === input.group.currency
  );
  if (confirmed.length === 0) throw new Error("TONTINE_NO_CONFIRMED_CONTRIBUTIONS");
  const feeByContribution = new Map(input.fees.map(f => [f.contributionId, f]));
  const gross = confirmed.reduce((sum, c) => sum + c.amountMinor, 0n);
  let totalFees = 0n;
  for (const c of confirmed) {
    const fee = feeByContribution.get(c.id);
    if (!fee) throw new Error("TONTINE_FEE_SNAPSHOT_MISSING");
    if (fee.currency !== input.group.currency ||
        fee.totalFeeMinor !== fee.microfinanceFeeMinor + fee.tpayFeeMinor) {
      throw new Error("TONTINE_FEE_SNAPSHOT_INVALID");
    }
    if (fee.totalFeeMinor > c.amountMinor) throw new Error("TONTINE_FEE_EXCEEDS_CONTRIBUTION");
    totalFees += fee.totalFeeMinor;
  }
  const net = gross - totalFees;
  if (net <= 0n) throw new Error("TONTINE_NET_POOL_INVALID");
  return {
    currency: input.group.currency,
    grossContributionsMinor: gross,
    totalFeesMinor: totalFees,
    netBeneficiaryAmountMinor: net,
    confirmedContributionCount: confirmed.length
  };
}

export function assignPoolToBeneficiary(
  slot: TontineBeneficiarySlot,
  pool: TontinePoolSettlement
): TontineBeneficiarySlot {
  if (slot.status !== "scheduled" && slot.status !== "eligible") {
    throw new Error("TONTINE_BENEFICIARY_SLOT_NOT_ASSIGNABLE");
  }
  if (slot.amountTargetMinor !== 0n) throw new Error("TONTINE_BENEFICIARY_AMOUNT_ALREADY_ASSIGNED");
  return { ...slot, amountTargetMinor: pool.netBeneficiaryAmountMinor, status: "eligible" };
}
