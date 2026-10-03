export type AccountKind = "asset" | "liability" | "equity" | "income" | "expense";
export type AccountStatus = "active" | "frozen" | "closed";

export interface FinancialAccount {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  kind: AccountKind;
  currency: string;
  status: AccountStatus;
  createdAt: string;
}

export function assertAccountCanPost(account: FinancialAccount): void {
  if (account.status !== "active") throw new Error("ACCOUNT_NOT_POSTABLE");
  if (!/^[A-Z]{3}$/.test(account.currency)) throw new Error("INVALID_CURRENCY");
}
