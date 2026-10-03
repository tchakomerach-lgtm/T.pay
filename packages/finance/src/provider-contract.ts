export type NormalizedProviderStatus = "initiated" | "pending" | "confirmed" | "failed" | "reversed";

export type ProviderCapability =
  | "initiate"
  | "query"
  | "callback"
  | "cancel"
  | "refund";

export interface ProviderIdentity {
  id: string;
  version: string;
  capabilities: ReadonlySet<ProviderCapability>;
}

export interface ProviderPaymentCommand {
  organizationId: string;
  paymentId: string;
  idempotencyKey: string;
  amountMinor: bigint;
  currency: string;
  payerReference: string;
  payeeReference: string;
  correlationId: string;
  callbackUrl?: string;
}

export interface ProviderPaymentResult {
  providerId: string;
  providerReference: string;
  status: NormalizedProviderStatus;
  rawStatus: string;
  correlationId: string;
  retryable: boolean;
}

export interface ProviderCallback {
  providerId: string;
  eventId: string;
  receivedAt: string;
  signature: string;
  payload: string;
}

export interface VerifiedProviderEvent {
  providerId: string;
  eventId: string;
  paymentId: string;
  providerReference: string;
  status: NormalizedProviderStatus;
  amountMinor: bigint;
  currency: string;
  idempotencyKey: string;
  correlationId: string;
  occurredAt: string;
}

export interface ProviderAdapter {
  readonly identity: ProviderIdentity;
  initiate(command: ProviderPaymentCommand): Promise<ProviderPaymentResult>;
  query(providerReference: string, correlationId: string): Promise<ProviderPaymentResult>;
  verifyCallback(callback: ProviderCallback): Promise<VerifiedProviderEvent>;
}

export function assertProviderResultMatchesCommand(
  command: ProviderPaymentCommand,
  result: ProviderPaymentResult
): void {
  if (result.providerId.length === 0) throw new Error("PROVIDER_ID_REQUIRED");
  if (result.providerReference.length === 0) throw new Error("PROVIDER_REFERENCE_REQUIRED");
  if (result.correlationId !== command.correlationId) throw new Error("PROVIDER_CORRELATION_MISMATCH");
  if (result.status === "confirmed" && command.amountMinor <= 0n) {
    throw new Error("PROVIDER_CONFIRMATION_INVALID_AMOUNT");
  }
}
