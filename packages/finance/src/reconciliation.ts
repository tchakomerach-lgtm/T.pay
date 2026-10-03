import type { ReconciliationExceptionKind } from "./reconciliation-exception.js";
export type ReconciliationOutcome = "matched" | ReconciliationExceptionKind;
export interface ReconciliationRecord {
  internalPaymentId?: string; providerReference?: string; internalAmountMinor?: bigint; providerAmountMinor?: bigint;
  internalCurrency?: string; providerCurrency?: string; internalStatus?: string; providerStatus?: string;
}
export function reconcile(record: ReconciliationRecord): ReconciliationOutcome {
  if (!record.internalPaymentId && record.providerReference) return "provider_only";
  if (record.internalPaymentId && !record.providerReference) return "internal_only";
  if (record.internalCurrency !== undefined && record.providerCurrency !== undefined && record.internalCurrency !== record.providerCurrency) return "currency_mismatch";
  if (record.internalAmountMinor !== undefined && record.providerAmountMinor !== undefined && record.internalAmountMinor !== record.providerAmountMinor) return "amount_mismatch";
  if (record.internalStatus !== undefined && record.providerStatus !== undefined && record.internalStatus !== record.providerStatus) return "status_mismatch";
  return "matched";
}