import type { Payment } from "./payment.js";

export type ProviderPaymentStatus = "accepted" | "pending" | "rejected";

export interface PaymentProviderRequest {
  paymentId: string;
  idempotencyKey: string;
  amountMinor: bigint;
  currency: string;
  payerReference: string;
  payeeReference: string;
  callbackUrl?: string;
}

export interface PaymentProviderResult {
  provider: string;
  providerReference: string;
  status: ProviderPaymentStatus;
  rawStatus: string;
}

export interface PaymentProvider {
  initiate(request: PaymentProviderRequest): Promise<PaymentProviderResult>;
  query(providerReference: string): Promise<PaymentProviderResult>;
}

export interface PaymentProviderRegistry {
  resolve(provider: string): PaymentProvider;
}

export function assertProviderPaymentMatches(payment: Payment, result: PaymentProviderResult): void {
  if (result.status === "rejected") throw new Error("PAYMENT_PROVIDER_REJECTED");
  if (!result.providerReference) throw new Error("PAYMENT_PROVIDER_REFERENCE_REQUIRED");
  if (!payment.id || payment.amount.minor <= 0n) throw new Error("PAYMENT_INVALID");
}
