import type { UUID } from "../../domain/src/types.js";
import type {
  CommunityTontineGroup,
  CommunityTontineMembership,
  TontineBeneficiarySlot,
  TontineContribution,
} from "./community-tontine.js";

export type TontineCycleStatus = "scheduled" | "open" | "settlement_pending" | "closed" | "paused" | "cancelled";
export type TontineContributionDueStatus = "scheduled" | "due" | "pending" | "confirmed" | "missed" | "reversed";
export type TontineBeneficiaryEligibility = "pending" | "eligible" | "blocked" | "paid";

export interface TontineCycle {
  id: UUID;
  groupId: UUID;
  cycleNumber: number;
  startsOn: string;
  endsOn: string;
  status: TontineCycleStatus;
  rulesVersion: string;
  minimumAmountMinor: bigint;
  currency: string;
  createdAt: string;
  closedAt?: string;
}

export interface TontineMemberSchedule {
  id: UUID;
  cycleId: UUID;
  membershipId: UUID;
  sequence: number;
  scheduledFor: string;
  expectedAmountMinor: bigint;
  dueStatus: TontineContributionDueStatus;
  contributionId?: UUID;
  graceUntil?: string;
  confirmedAt?: string;
}

export interface TontineAttendance {
  membershipId: UUID;
  cycleId: UUID;
  scheduledCount: number;
  confirmedCount: number;
  missedCount: number;
  attendanceRatioBps: bigint;
}

export interface TontineCycleSnapshot {
  cycle: TontineCycle;
  schedules: readonly TontineMemberSchedule[];
  attendance: readonly TontineAttendance[];
  beneficiarySlots: readonly TontineBeneficiarySlot[];
}

function isoDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) throw new Error("TONTINE_DATE_INVALID");
  return date;
}

function addPeriod(date: Date, frequency: CommunityTontineGroup["frequency"], count: number): Date {
  const next = new Date(date);
  if (frequency === "daily") next.setUTCDate(next.getUTCDate() + count);
  else if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + count * 7);
  else next.setUTCMonth(next.getUTCMonth() + count);
  return next;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createTontineCycle(
  group: CommunityTontineGroup,
  input: { id: UUID; startsOn: string; periods: number; rulesVersion: string; createdAt: string }
): TontineCycle {
  if (group.status !== "active") throw new Error("TONTINE_GROUP_NOT_ACTIVE");
  if (!Number.isInteger(input.periods) || input.periods < 1 || input.periods > 3660) throw new Error("TONTINE_PERIODS_INVALID");
  if (!input.rulesVersion.trim()) throw new Error("TONTINE_RULE_VERSION_REQUIRED");
  const starts = isoDate(input.startsOn);
  const ends = addPeriod(starts, group.frequency, input.periods - 1);
  return {
    id: input.id,
    groupId: group.id,
    cycleNumber: group.cycleNumber,
    startsOn: dateOnly(starts),
    endsOn: dateOnly(ends),
    status: "scheduled",
    rulesVersion: input.rulesVersion,
    minimumAmountMinor: group.minimumAmountMinor,
    currency: group.currency,
    createdAt: input.createdAt,
  };
}

export function buildMemberSchedules(
  cycle: TontineCycle,
  group: CommunityTontineGroup,
  memberships: readonly CommunityTontineMembership[]
): TontineMemberSchedule[] {
  const start = isoDate(cycle.startsOn);
  const end = isoDate(cycle.endsOn);
  const schedules: TontineMemberSchedule[] = [];
  let sequence = 1;
  for (const member of memberships) {
    if (member.groupId !== group.id || member.status !== "active") continue;
    const cursor = new Date(start);
    while (cursor <= end) {
      const expected = group.contributionMode === "fixed" ? group.fixedAmountMinor! : group.minimumAmountMinor;
      schedules.push({
        id: `${cycle.id}:${member.id}:${sequence}` as UUID,
        cycleId: cycle.id,
        membershipId: member.id,
        sequence,
        scheduledFor: dateOnly(cursor),
        expectedAmountMinor: expected,
        dueStatus: "scheduled",
      });
      sequence += 1;
      cursor.setUTCDate(cursor.getUTCDate() + (group.frequency === "daily" ? 1 : group.frequency === "weekly" ? 7 : 30));
    }
  }
  return schedules;
}

export function markScheduleDue(
  schedule: TontineMemberSchedule,
  today: string
): TontineMemberSchedule {
  if (schedule.dueStatus !== "scheduled") return schedule;
  if (isoDate(today) < isoDate(schedule.scheduledFor)) return schedule;
  return { ...schedule, dueStatus: "due" };
}

export function applyContributionToSchedule(
  schedule: TontineMemberSchedule,
  contribution: TontineContribution
): TontineMemberSchedule {
  if (contribution.membershipId !== schedule.membershipId) throw new Error("TONTINE_SCHEDULE_MEMBER_MISMATCH");
  if (contribution.status !== "confirmed") return schedule;
  if (contribution.amountMinor < schedule.expectedAmountMinor && contribution.amountMinor < 1n) {
    throw new Error("TONTINE_CONTRIBUTION_INVALID");
  }
  return {
    ...schedule,
    dueStatus: "confirmed",
    contributionId: contribution.id,
    confirmedAt: new Date().toISOString(),
  };
}

export function calculateAttendance(
  cycleId: UUID,
  membershipId: UUID,
  schedules: readonly TontineMemberSchedule[]
): TontineAttendance {
  const mine = schedules.filter((s) => s.cycleId === cycleId && s.membershipId === membershipId);
  const confirmedCount = mine.filter((s) => s.dueStatus === "confirmed").length;
  const missedCount = mine.filter((s) => s.dueStatus === "missed").length;
  const scheduledCount = mine.length;
  const attendanceRatioBps = scheduledCount === 0 ? 0n : BigInt(Math.floor((confirmedCount * 10000) / scheduledCount));
  return { membershipId, cycleId, scheduledCount, confirmedCount, missedCount, attendanceRatioBps };
}

export function closeCycle(
  cycle: TontineCycle,
  schedules: readonly TontineMemberSchedule[],
  beneficiarySlots: readonly TontineBeneficiarySlot[]
): TontineCycle {
  if (cycle.status === "cancelled") throw new Error("TONTINE_CYCLE_CANCELLED");
  if (schedules.some((s) => s.dueStatus === "pending" || s.dueStatus === "due")) {
    throw new Error("TONTINE_CYCLE_UNSETTLED_CONTRIBUTIONS");
  }
  if (beneficiarySlots.some((s) => s.status === "eligible" || s.status === "scheduled")) {
    throw new Error("TONTINE_CYCLE_BENEFICIARY_PENDING");
  }
  return { ...cycle, status: "closed", closedAt: new Date().toISOString() };
}
