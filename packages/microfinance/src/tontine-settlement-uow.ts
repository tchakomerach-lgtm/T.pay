import type { UUID } from "../../domain/src/types.js";
import type { LedgerLine } from "../../finance/src/ledger.js";
import type { TontineContribution, TontineFeeSnapshot } from "./community-tontine.js";
import type { TontinePaymentIntent, TontineProviderEvent, TontineReceipt } from "./tontine-settlement.js";

export type SettlementIsolation = "read_committed" | "serializable";

export interface SettlementTransactionContext {
  readonly isolation: SettlementIsolation;
  readonly organizationId: UUID;
  readonly transactionId: string;
}

export interface DurableTontineSettlementRepository {
  /**
   * The implementation MUST execute the whole callback in one DB transaction.
   * Provider event uniqueness, ledger idempotency and state transitions are
   * database-enforced invariants, not process-local locks.
   */
  runAtomic<T>(
    input: {
      organizationId: UUID;
      idempotencyKey: string;
      isolation: SettlementIsolation;
    },
    operation: (tx: SettlementTransactionContext & DurableSettlementTx) => Promise<T>
  ): Promise<T>;
}

export interface DurableSettlementTx {
  providerEvents: {
    /**
     * Returns false when another transaction already claimed this provider
     * event. Claim and settlement must share the same transaction.
     */
    claim(provider: string, eventId: string, receivedAt: string): Promise<boolean>;
  };
  ledger: {
    findByIdempotencyKey(organizationId: UUID, key: string): Promise<{ id: string } | undefined>;
    append(input: {
      id: string;
      organizationId: UUID;
      idempotencyKey: string;
      occurredAt: string;
      lines: readonly LedgerLine[];
      postedAt: string;
    }): Promise<void>;
  };
  contributions: {
    getForUpdate(organizationId: UUID, contributionId: UUID): Promise<TontineContribution>;
    confirm(
      organizationId: UUID,
      contributionId: UUID,
      paymentIntentId: UUID,
      providerReference: string,
      confirmedAt: string
    ): Promise<void>;
  };
  payments: {
    getForUpdate(organizationId: UUID, paymentIntentId: UUID): Promise<TontinePaymentIntent>;
    markSettled(organizationId: UUID, paymentIntentId: UUID, settledAt: string): Promise<void>;
  };
  fees: {
    insertImmutable(snapshot: TontineFeeSnapshot): Promise<void>;
  };
  receipts: {
    insert(receipt: TontineReceipt): Promise<void>;
  };
  outbox: {
    enqueue(input: {
      id: string;
      organizationId: UUID;
      eventType: string;
      aggregateId: UUID;
      occurredAt: string;
      payload: string;
    }): Promise<void>;
  };
}

export interface DurableSettlementInput {
  organizationId: UUID;
  paymentIntent: TontinePaymentIntent;
  contribution: TontineContribution;
  providerEvent: TontineProviderEvent;
  feeSnapshot: TontineFeeSnapshot;
  ledgerTransaction: {
    id: string;
    organizationId: UUID;
    idempotencyKey: string;
    occurredAt: string;
    lines: readonly LedgerLine[];
    postedAt: string;
  };
  receipt: TontineReceipt;
  outboxEvent: {
    id: string;
    eventType: string;
    payload: string;
  };
  now: string;
}

export interface DurableSettlementResult {
  replay: boolean;
  receipt: TontineReceipt;
}

export async function executeDurableTontineSettlement(
  input: DurableSettlementInput,
  repository: DurableTontineSettlementRepository
): Promise<DurableSettlementResult> {
  if (input.organizationId !== input.paymentIntent.organizationId ||
      input.organizationId !== input.ledgerTransaction.organizationId) {
    throw new Error("SETTLEMENT_ORGANIZATION_MISMATCH");
  }

  if (input.paymentIntent.contributionId !== input.contribution.id) {
    throw new Error("SETTLEMENT_CONTRIBUTION_MISMATCH");
  }

  if (input.paymentIntent.idempotencyKey !== input.contribution.idempotencyKey ||
      input.paymentIntent.idempotencyKey !== input.ledgerTransaction.idempotencyKey) {
    throw new Error("SETTLEMENT_IDEMPOTENCY_MISMATCH");
  }

  if (input.providerEvent.paymentId !== input.paymentIntent.id ||
      input.providerEvent.providerReference !== input.paymentIntent.providerReference) {
    throw new Error("SETTLEMENT_PROVIDER_REFERENCE_MISMATCH");
  }

  if (input.providerEvent.amountMinor !== input.paymentIntent.amountMinor ||
      input.providerEvent.currency !== input.paymentIntent.currency) {
    throw new Error("SETTLEMENT_AMOUNT_OR_CURRENCY_MISMATCH");
  }

  if (input.providerEvent.status !== "accepted") {
    throw new Error("SETTLEMENT_PROVIDER_NOT_ACCEPTED");
  }

  return repository.runAtomic(
    {
      organizationId: input.organizationId,
      idempotencyKey: input.paymentIntent.idempotencyKey,
      isolation: "serializable"
    },
    async (tx) => {
      const payment = await tx.payments.getForUpdate(input.organizationId, input.paymentIntent.id);
      const contribution = await tx.contributions.getForUpdate(input.organizationId, input.contribution.id);

      if (payment.contributionId !== contribution.id) {
        throw new Error("SETTLEMENT_PERSISTED_CONTEXT_MISMATCH");
      }

      const existing = await tx.ledger.findByIdempotencyKey(
        input.organizationId,
        input.paymentIntent.idempotencyKey
      );
      if (existing) {
        return { replay: true, receipt: input.receipt };
      }

      const claimed = await tx.providerEvents.claim(
        input.providerEvent.provider,
        input.providerEvent.eventId,
        input.now
      );
      if (!claimed) {
        const settled = await tx.ledger.findByIdempotencyKey(
          input.organizationId,
          input.paymentIntent.idempotencyKey
        );
        if (settled) return { replay: true, receipt: input.receipt };
        throw new Error("SETTLEMENT_PROVIDER_EVENT_IN_PROGRESS");
      }

      await tx.ledger.append(input.ledgerTransaction);
      await tx.fees.insertImmutable(input.feeSnapshot);
      await tx.contributions.confirm(
        input.organizationId,
        input.contribution.id,
        input.paymentIntent.id,
        input.providerEvent.providerReference,
        input.now
      );
      await tx.payments.markSettled(input.organizationId, input.paymentIntent.id, input.now);
      await tx.receipts.insert(input.receipt);
      await tx.outbox.enqueue({
        id: input.outboxEvent.id,
        organizationId: input.organizationId,
        eventType: input.outboxEvent.eventType,
        aggregateId: input.contribution.id,
        occurredAt: input.now,
        payload: input.outboxEvent.payload
      });

      return { replay: false, receipt: input.receipt };
    }
  );
}
