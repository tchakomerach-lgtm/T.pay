export type ReconciliationOutcome = "matched" | "provider_only" | "internal_only" | "amount_mismatch" | "status_mismatch";

export interface ReconciliationRecord {
  internalPaymentId: string;
  providerReference: string;
  internalAmountMinor: bigint;
  providerAmountMinor: bigint;
  internalStatus: string;
  providerStatus: string;
}

export function reconcile(record: ReconciliationRecord): ReconciliationOutcome {
  if (record.internalAmountMinor !== record.providerAmountMinor) return "amount_mismatch";
  if (record.internalStatus !== record.providerStatus) return "status_mismatch";
  return "matched";
}
