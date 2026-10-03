import type { UUID } from "../../domain/src/types.js";

export type TontineReconciliationStatus = "matched" | "pending" | "mismatch" | "provider_only" | "ledger_only";

export interface TontineExternalRecord {
  provider: string;
  providerReference: string;
  groupId: UUID;
  contributionId?: UUID;
  amountMinor: bigint;
  currency: string;
  status: "pending" | "completed" | "failed" | "reversed";
}

export interface TontineInternalRecord {
  contributionId: UUID;
  groupId: UUID;
  amountMinor: bigint;
  currency: string;
  status: "pending" | "confirmed" | "missed" | "reversed";
}

export function reconcileTontinePayment(
  external: TontineExternalRecord | undefined,
  internal: TontineInternalRecord | undefined
): TontineReconciliationStatus {
  if (external && !internal) return "provider_only";
  if (!external && internal) return "ledger_only";
  if (!external || !internal) return "pending";
  if (external.groupId !== internal.groupId || external.amountMinor !== internal.amountMinor || external.currency !== internal.currency) {
    return "mismatch";
  }
  if (external.status === "completed" && internal.status === "confirmed") return "matched";
  return "pending";
}
