export type SubsidyStatus = "requested" | "under_review" | "approved" | "funded" | "recovering" | "closed" | "rejected";

export interface SchoolSubsidy {
  id: string;
  schoolOrganizationId: string;
  microfinanceOrganizationId?: string;
  academicYear: string;
  totalMinor: bigint;
  currency: string;
  status: SubsidyStatus;
  idempotencyKey: string;
}

export interface ParentRecoveryPlan {
  id: string;
  subsidyId: string;
  parentClientId: string;
  dailyMinimumMinor: bigint;
  currency: string;
  startedAt?: string;
  status: "pending" | "active" | "completed" | "defaulted";
}

export function assertSubsidyTransition(from: SubsidyStatus, to: SubsidyStatus): void {
  const allowed: Record<SubsidyStatus, readonly SubsidyStatus[]> = {
    requested:["under_review","rejected"], under_review:["approved","rejected"],
    approved:["funded","rejected"], funded:["recovering"], recovering:["closed"],
    closed:[], rejected:[]
  };
  if (!allowed[from].includes(to)) throw new Error(`INVALID_SUBSIDY_TRANSITION:${from}->${to}`);
}

export function validateRecoveryPlan(plan: ParentRecoveryPlan): void {
  if (plan.dailyMinimumMinor < 500n) throw new Error("RECOVERY_DAILY_MINIMUM_TOO_LOW");
  if (plan.currency.length !== 3) throw new Error("RECOVERY_CURRENCY_INVALID");
}
