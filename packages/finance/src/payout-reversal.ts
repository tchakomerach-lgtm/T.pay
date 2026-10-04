import type { PayoutIntent } from "./payout.js";
import type { PayoutSettlementEvidence, PayoutProvider } from "./payout-orchestrator.js";
import { assertPayoutReversalAllowed } from "./payout-reconciliation.js";
import { money } from "./ledger.js";
import { postFinancialTransaction, type PostFinancialTransactionResult } from "./transactional-ledger.js";
import type { FinancialUnitOfWork } from "./persistence.js";

export interface PayoutReversalRequest {
  reversalId: string;
  organizationId: string;
  payoutId: string;
  provider: ReversiblePayoutProvider;
  providerReference: string;
  amountMinor: bigint;
  currency: string;
  reason: string;
  idempotencyKey: string;
}

export interface PayoutReversalProviderRequest {
  payoutId: string;
  providerReference: string;
  amountMinor: bigint;
  currency: string;
  idempotencyKey: string;
  reason: string;
}

export interface PayoutReversalProviderResult {
  provider: string;
  providerReference: string;
  status: "accepted" | "pending" | "rejected" | "confirmed";
}

export interface ReversiblePayoutProvider extends PayoutProvider {
  reverse(request: PayoutReversalProviderRequest): Promise<PayoutReversalProviderResult>;
}

export async function initiatePayoutReversal(
  intent: PayoutIntent,
  evidence: PayoutSettlementEvidence,
  request: PayoutReversalRequest
): Promise<PayoutReversalProviderResult> {
  assertPayoutReversalAllowed(intent, evidence);
  if (request.organizationId !== intent.organizationId || request.payoutId !== intent.payoutId) {
    throw new Error("PAYOUT_REVERSAL_IDENTITY_MISMATCH");
  }
  if (request.amountMinor !== intent.amountMinor || request.currency !== intent.currency) {
    throw new Error("PAYOUT_REVERSAL_AMOUNT_MISMATCH");
  }
  if (!request.reason.trim()) throw new Error("PAYOUT_REVERSAL_REASON_REQUIRED");
  if (!request.idempotencyKey) throw new Error("PAYOUT_REVERSAL_IDEMPOTENCY_REQUIRED");
  return request.provider.reverse({
    payoutId: intent.payoutId,
    providerReference: request.providerReference,
    amountMinor: request.amountMinor,
    currency: request.currency,
    idempotencyKey: request.idempotencyKey,
    reason: request.reason
  });
}

export function buildPayoutReversalFinancialIdempotency(
  organizationId: string,
  payoutId: string,
  reversalProviderReference: string
): string {
  return `payout-reversal:${organizationId}:${payoutId}:${reversalProviderReference}`;
}

export async function settleConfirmedPayoutReversal(
  uow: FinancialUnitOfWork,
  intent: PayoutIntent,
  evidence: PayoutSettlementEvidence,
  reversalProviderReference: string,
  sourceAccountId: string,
  beneficiaryAccountId: string,
  transactionId: string,
  now = new Date().toISOString()
): Promise<PostFinancialTransactionResult> {
  assertPayoutReversalAllowed(intent, evidence);
  if (!reversalProviderReference) throw new Error("PAYOUT_REVERSAL_PROVIDER_REFERENCE_REQUIRED");
  return postFinancialTransaction(uow, {
    id: transactionId,
    organizationId: intent.organizationId,
    idempotencyKey: buildPayoutReversalFinancialIdempotency(intent.organizationId, intent.payoutId, reversalProviderReference),
    occurredAt: now,
    postedAt: now,
    lines: [
      { accountId: beneficiaryAccountId, amount: money(intent.currency, intent.amountMinor), direction: "debit" },
      { accountId: sourceAccountId, amount: money(intent.currency, intent.amountMinor), direction: "credit" }
    ]
  });
}
