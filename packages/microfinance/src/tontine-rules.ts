import type { CommunityTontineGroup, TontineBeneficiarySlot, TontineFrequency } from "./community-tontine.js";

export interface TontineRules {
  version: string;
  minimumAttendanceRatioBps: bigint;
  missedContributionGracePeriods: number;
  allowEarlyBeneficiaryPayment: boolean;
  requireKycBeforePayout: boolean;
  requireHumanApprovalForPayout: boolean;
  allowMemberVoteChanges: boolean;
}

export interface ContributionSchedule {
  scheduledFor: string;
  sequence: number;
}

export function scheduleContribution(group: CommunityTontineGroup, startDate: string, periods: number): ContributionSchedule[] {
  if (!Number.isInteger(periods) || periods < 1 || periods > 3660) throw new Error("TONTINE_PERIODS_INVALID");
  const start = new Date(startDate);
  if (!Number.isFinite(start.getTime())) throw new Error("TONTINE_START_DATE_INVALID");
  const out: ContributionSchedule[] = [];
  for (let i = 0; i < periods; i += 1) {
    const d = new Date(start);
    if (group.frequency === "daily") d.setUTCDate(d.getUTCDate() + i);
    else if (group.frequency === "weekly") d.setUTCDate(d.getUTCDate() + i * 7);
    else d.setUTCMonth(d.getUTCMonth() + i);
    out.push({ scheduledFor: d.toISOString().slice(0, 10), sequence: i + 1 });
  }
  return out;
}

export function validateRulesForGroup(group: CommunityTontineGroup, rules: TontineRules): void {
  if (!rules.version.trim()) throw new Error("TONTINE_RULE_VERSION_REQUIRED");
  if (rules.minimumAttendanceRatioBps < 0n || rules.minimumAttendanceRatioBps > 10000n) throw new Error("TONTINE_ATTENDANCE_RATIO_INVALID");
  if (rules.missedContributionGracePeriods < 0 || rules.missedContributionGracePeriods > 366) throw new Error("TONTINE_GRACE_PERIOD_INVALID");
  if (group.governance === "member_vote" && !rules.allowMemberVoteChanges) throw new Error("TONTINE_VOTE_RULE_REQUIRED");
}

export function assertPayoutAllowed(
  group: CommunityTontineGroup,
  slot: TontineBeneficiarySlot,
  rules: TontineRules,
  kycVerified: boolean,
  humanApproved: boolean
): void {
  if (group.status !== "active") throw new Error("TONTINE_GROUP_NOT_ACTIVE");
  if (slot.status !== "eligible" && slot.status !== "scheduled") throw new Error("TONTINE_PAYOUT_SLOT_INVALID");
  if (rules.requireKycBeforePayout && !kycVerified) throw new Error("TONTINE_KYC_REQUIRED");
  if (rules.requireHumanApprovalForPayout && !humanApproved) throw new Error("TONTINE_HUMAN_APPROVAL_REQUIRED");
  if (!rules.allowEarlyBeneficiaryPayment && slot.status !== "eligible") throw new Error("TONTINE_EARLY_PAYOUT_FORBIDDEN");
}
