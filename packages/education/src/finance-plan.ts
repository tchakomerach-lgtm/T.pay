export interface StudentFinancePlan {
  id: string;
  studentId: string;
  schoolOrganizationId: string;
  academicYear: string;
  tuitionMinor: bigint;
  suppliesMinor: bigint;
  currency: string;
  fundedMinor: bigint;
  recoveredMinor: bigint;
  status: "draft" | "requested" | "funded" | "recovering" | "closed" | "defaulted";
}

export function outstandingMinor(plan: StudentFinancePlan): bigint {
  const total = plan.tuitionMinor + plan.suppliesMinor;
  const outstanding = total - plan.fundedMinor;
  return outstanding > 0n ? outstanding : 0n;
}

export function recoveryOutstandingMinor(plan: StudentFinancePlan): bigint {
  const outstanding = plan.fundedMinor - plan.recoveredMinor;
  return outstanding > 0n ? outstanding : 0n;
}
