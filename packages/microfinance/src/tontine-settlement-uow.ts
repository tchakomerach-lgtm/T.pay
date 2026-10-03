import { assertBalanced, type LedgerLine } from "../../finance/src/ledger.js";
import type { UUID } from "../../domain/src/types.js";
import type { TontineContribution, TontineFeeSnapshot } from "./community-tontine.js";
import type { TontinePaymentIntent, TontineProviderEvent, TontineReceipt } from "./tontine-settlement.js";

export type SettlementIsolation = "read_committed" | "serializable";

export interface SettlementTransactionContext {
  readonly isolation: SettlementIsolation;
  readonly organizationId: UUID;
  readonly transactionId: string;
}

export interface DurableTontineSettlementRepository {
  runAtomic<T>(input: { organizationId: UUID; idempotencyKey: string; isolation: SettlementIsolation }, operation: (tx: SettlementTransactionContext & DurableSettlementTx) => Promise<T>): Promise<T>;
}

export interface DurableSettlementTx {
  providerEvents: { claim(provider: string, eventId: string, receivedAt: string): Promise<boolean> };
  ledger: {
    findByIdempotencyKey(organizationId: UUID, key: string): Promise<{ id: string } | undefined>;
    append(input: { id: string; organizationId: UUID; idempotencyKey: string; occurredAt: string; lines: readonly LedgerLine[]; postedAt: string }): Promise<void>;
  };
  contributions: {
    getForUpdate(organizationId: UUID, contributionId: UUID): Promise<TontineContribution>;
    confirm(organizationId: UUID, contributionId: UUID, paymentIntentId: UUID, providerReference: string, confirmedAt: string): Promise<void>;
  };
  payments: {
    getForUpdate(organizationId: UUID, paymentIntentId: UUID): Promise<TontinePaymentIntent>;
    markSettled(organizationId: UUID, paymentIntentId: UUID, settledAt: string): Promise<void>;
  };
  fees: { insertImmutable(snapshot: TontineFeeSnapshot): Promise<void> };
  receipts: { insert(receipt: TontineReceipt): Promise<void> };
  outbox: { enqueue(input: { id: string; organizationId: UUID; eventType: string; aggregateId: UUID; occurredAt: string; payload: string }): Promise<void> };
}

export interface DurableSettlementInput {
  organizationId: UUID;
  paymentIntent: TontinePaymentIntent;
  contribution: TontineContribution;
  providerEvent: TontineProviderEvent;
  feeSnapshot: TontineFeeSnapshot;
  ledgerTransaction: { id: string; organizationId: UUID; idempotencyKey: string; occurredAt: string; lines: readonly LedgerLine[]; postedAt: string };
  receipt: TontineReceipt;
  outboxEvent: { id: string; eventType: string; payload: string };
  now: string;
}

function sumLines(lines: readonly LedgerLine[], direction: LedgerLine["direction"], currency: string): bigint {
  return lines.filter(line => line.direction === direction && line.amount.currency === currency).reduce((sum, line) => sum + line.amount.minor, 0n);
}

/**
 * S-03.4 gate: the immutable fee snapshot, provider amount, receipt amount and
 * balanced Ledger must describe the same gross contribution. The fee snapshot
 * is persisted atomically with the Ledger; it is not a second money source.
 */
export function assertSettlementAccounting(input: DurableSettlementInput): void {
  const { contribution, paymentIntent, providerEvent, feeSnapshot, ledgerTransaction, receipt } = input;
  if (feeSnapshot.contributionId !== contribution.id) throw new Error("SETTLEMENT_FEE_CONTRIBUTION_MISMATCH");
  if (feeSnapshot.currency !== contribution.currency || feeSnapshot.currency !== paymentIntent.currency || feeSnapshot.currency !== providerEvent.currency) {
    throw new Error("SETTLEMENT_FEE_CURRENCY_MISMATCH");
  }
  if (feeSnapshot.microfinanceFeeMinor < 0n || feeSnapshot.tpayFeeMinor < 0n || feeSnapshot.totalFeeMinor < 0n ||
      feeSnapshot.totalFeeMinor !== feeSnapshot.microfinanceFeeMinor + feeSnapshot.tpayFeeMinor) {
    throw new Error("SETTLEMENT_FEE_TOTAL_INVALID");
  }
  if (feeSnapshot.totalFeeMinor > contribution.amountMinor) throw new Error("SETTLEMENT_FEE_EXCEEDS_CONTRIBUTION");
  assertBalanced(ledgerTransaction.lines);
  const debit = sumLines(ledgerTransaction.lines, "debit", contribution.currency);
  const credit = sumLines(ledgerTransaction.lines, "credit", contribution.currency);
  if (contribution.amountMinor !== paymentIntent.amountMinor || contribution.amountMinor !== providerEvent.amountMinor || contribution.amountMinor !== receipt.amountMinor) {
    throw new Error("SETTLEMENT_GROSS_AMOUNT_MISMATCH");
  }
  if (debit !== contribution.amountMinor || credit !== contribution.amountMinor) throw new Error("SETTLEMENT_LEDGER_GROSS_MISMATCH");
  if (receipt.contributionId !== contribution.id || receipt.paymentIntentId !== paymentIntent.id ||
      receipt.currency !== contribution.currency || receipt.providerReference !== providerEvent.providerReference ||
      receipt.ledgerTransactionId !== ledgerTransaction.id) {
    throw new Error("SETTLEMENT_RECEIPT_CONTEXT_MISMATCH");
  }
  if (ledgerTransaction.organizationId !== input.organizationId || ledgerTransaction.idempotencyKey !== paymentIntent.idempotencyKey) {
    throw new Error("SETTLEMENT_LEDGER_CONTEXT_MISMATCH");
  }
}

export function validateProviderEventAgainstPayment(input: { organizationId: UUID; paymentIntent: TontinePaymentIntent; providerEvent: TontineProviderEvent }): void {
  if (input.organizationId !== input.paymentIntent.organizationId) throw new Error("PROVIDER_EVENT_ORGANIZATION_MISMATCH");
  if (!input.providerEvent.provider || !input.providerEvent.eventId) throw new Error("PROVIDER_EVENT_IDENTITY_INVALID");
  if (input.providerEvent.provider !== input.paymentIntent.provider) throw new Error("PROVIDER_EVENT_PROVIDER_MISMATCH");
  if (input.providerEvent.paymentId !== input.paymentIntent.id) throw new Error("PAYMENT_INTENT_MISMATCH");
  if (input.providerEvent.providerReference !== input.paymentIntent.providerReference) throw new Error("PROVIDER_REFERENCE_MISMATCH");
  if (input.providerEvent.amountMinor !== input.paymentIntent.amountMinor || input.providerEvent.currency !== input.paymentIntent.currency) throw new Error("PROVIDER_AMOUNT_OR_CURRENCY_MISMATCH");
  if (input.providerEvent.status !== "accepted") throw new Error("SETTLEMENT_PROVIDER_NOT_ACCEPTED");
}

export interface DurableSettlementResult { replay: boolean; receipt: TontineReceipt; }

export async function executeDurableTontineSettlement(input: DurableSettlementInput, repository: DurableTontineSettlementRepository): Promise<DurableSettlementResult> {
  if (input.organizationId !== input.paymentIntent.organizationId || input.organizationId !== input.ledgerTransaction.organizationId) throw new Error("SETTLEMENT_ORGANIZATION_MISMATCH");
  if (input.paymentIntent.contributionId !== input.contribution.id) throw new Error("SETTLEMENT_CONTRIBUTION_MISMATCH");
  if (input.paymentIntent.idempotencyKey !== input.contribution.idempotencyKey || input.paymentIntent.idempotencyKey !== input.ledgerTransaction.idempotencyKey) throw new Error("SETTLEMENT_IDEMPOTENCY_MISMATCH");
  validateProviderEventAgainstPayment({ organizationId: input.organizationId, paymentIntent: input.paymentIntent, providerEvent: input.providerEvent });
  assertSettlementAccounting(input);

  return repository.runAtomic({ organizationId: input.organizationId, idempotencyKey: input.paymentIntent.idempotencyKey, isolation: "serializable" }, async tx => {
    const payment = await tx.payments.getForUpdate(input.organizationId, input.paymentIntent.id);
    const contribution = await tx.contributions.getForUpdate(input.organizationId, input.contribution.id);
    if (payment.organizationId !== input.organizationId) throw new Error("SETTLEMENT_PERSISTED_ORGANIZATION_MISMATCH");
    if (payment.provider !== input.providerEvent.provider) throw new Error("SETTLEMENT_PERSISTED_PROVIDER_MISMATCH");
    if (payment.contributionId !== contribution.id) throw new Error("SETTLEMENT_PERSISTED_CONTEXT_MISMATCH");
    if (payment.idempotencyKey !== input.paymentIntent.idempotencyKey || contribution.idempotencyKey !== input.paymentIntent.idempotencyKey) throw new Error("SETTLEMENT_PERSISTED_IDEMPOTENCY_MISMATCH");
    if (payment.amountMinor !== input.paymentIntent.amountMinor || payment.currency !== input.paymentIntent.currency) throw new Error("SETTLEMENT_PERSISTED_AMOUNT_OR_CURRENCY_MISMATCH");
    if (contribution.amountMinor !== input.contribution.amountMinor || contribution.currency !== input.contribution.currency) throw new Error("SETTLEMENT_PERSISTED_CONTRIBUTION_AMOUNT_MISMATCH");

    const existing = await tx.ledger.findByIdempotencyKey(input.organizationId, input.paymentIntent.idempotencyKey);
    if (existing) return { replay: true, receipt: input.receipt };

    const claimed = await tx.providerEvents.claim(input.providerEvent.provider, input.providerEvent.eventId, input.now);
    if (!claimed) {
      const settled = await tx.ledger.findByIdempotencyKey(input.organizationId, input.paymentIntent.idempotencyKey);
      if (settled) return { replay: true, receipt: input.receipt };
      throw new Error("SETTLEMENT_PROVIDER_EVENT_IN_PROGRESS");
    }

    await tx.ledger.append(input.ledgerTransaction);
    await tx.fees.insertImmutable(input.feeSnapshot);
    await tx.contributions.confirm(input.organizationId, input.contribution.id, input.paymentIntent.id, input.providerEvent.providerReference, input.now);
    await tx.payments.markSettled(input.organizationId, input.paymentIntent.id, input.now);
    await tx.receipts.insert(input.receipt);
    await tx.outbox.enqueue({ id: input.outboxEvent.id, organizationId: input.organizationId, eventType: input.outboxEvent.eventType, aggregateId: input.contribution.id, occurredAt: input.now, payload: input.outboxEvent.payload });
    return { replay: false, receipt: input.receipt };
  });
}
