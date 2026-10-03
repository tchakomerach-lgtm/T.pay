export type ReconciliationExceptionKind = "provider_only" | "internal_only" | "amount_mismatch" | "status_mismatch" | "currency_mismatch" | "identity_mismatch" | "duplicate_provider_event";
export type ReconciliationExceptionSeverity = "low" | "medium" | "high" | "critical";
export type ReconciliationExceptionStatus = "open" | "investigating" | "resolved" | "rejected";
export interface ReconciliationException {
  readonly id: string; readonly organizationId: string; readonly kind: ReconciliationExceptionKind;
  readonly severity: ReconciliationExceptionSeverity; readonly status: ReconciliationExceptionStatus;
  readonly internalPaymentId?: string; readonly providerReference?: string; readonly evidenceHash: string;
  readonly detectedAt: string; readonly assignedTo?: string; readonly resolutionCode?: string;
}
const severityByKind: Record<ReconciliationExceptionKind, ReconciliationExceptionSeverity> = {
  provider_only:"high", internal_only:"high", amount_mismatch:"critical", status_mismatch:"high",
  currency_mismatch:"critical", identity_mismatch:"critical", duplicate_provider_event:"high"
};
export function classifyReconciliationException(input: {
  id:string; organizationId:string; kind:ReconciliationExceptionKind; internalPaymentId?:string;
  providerReference?:string; evidenceHash:string; detectedAt:string;
}): ReconciliationException {
  return {...input, severity: severityByKind[input.kind], status:"open"};
}
export interface ReconciliationExceptionStore {
  create(exception: ReconciliationException): Promise<boolean>;
  claim(id:string, investigatorId:string): Promise<boolean>;
  resolve(id:string, investigatorId:string, resolutionCode:string): Promise<boolean>;
  reject(id:string, investigatorId:string, resolutionCode:string): Promise<boolean>;
}