import { assertBalanced, type LedgerLine } from "./ledger.js";
import type {
  DurableSettlementTx,
  DurableTontineSettlementRepository,
  SettlementIsolation,
  SettlementTransactionContext
} from "../../microfinance/src/tontine-settlement-uow.js";
import type { TontineContribution, TontineFeeSnapshot } from "../../microfinance/src/community-tontine.js";
import type { TontinePaymentIntent, TontineReceipt } from "../../microfinance/src/tontine-settlement.js";
import type { UUID } from "../../domain/src/types.js";

export interface PostgresQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  readonly rows: readonly Row[];
  readonly rowCount: number;
}

export interface PostgresClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<PostgresQueryResult<Row>>;
}

export interface PostgresSettlementRetryPolicy {
  readonly maxAttempts: number;
}

const SERIALIZATION_FAILURE = "40001";
const DEADLOCK_DETECTED = "40P01";

function sqlIsolation(isolation: SettlementIsolation): "SERIALIZABLE" | "READ COMMITTED" {
  return isolation === "serializable" ? "SERIALIZABLE" : "READ COMMITTED";
}

function isTransientTransactionError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  return code === SERIALIZATION_FAILURE || code === DEADLOCK_DETECTED;
}

function requireRow<T extends Record<string, unknown>>(result: PostgresQueryResult<T>, code: string): T {
  const row = result.rows[0];
  if (!row) throw new Error(code);
  return row;
}

function bigintValue(value: unknown, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new Error("INVALID_DB_BIGINT_" + field);
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("INVALID_DB_STRING_" + field);
  return value;
}

export class PostgresDurableTontineSettlementRepository
  implements DurableTontineSettlementRepository {
  constructor(
    private readonly client: PostgresClient,
    private readonly retryPolicy: PostgresSettlementRetryPolicy = { maxAttempts: 3 }
  ) {
    if (!Number.isInteger(retryPolicy.maxAttempts) || retryPolicy.maxAttempts < 1 || retryPolicy.maxAttempts > 5) {
      throw new Error("INVALID_SETTLEMENT_RETRY_POLICY");
    }
  }

  async runAtomic<T>(
    input: {
      organizationId: UUID;
      idempotencyKey: string;
      isolation: SettlementIsolation;
    },
    operation: (tx: SettlementTransactionContext & DurableSettlementTx) => Promise<T>
  ): Promise<T> {
    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt += 1) {
      await this.client.query("BEGIN ISOLATION LEVEL " + sqlIsolation(input.isolation) + " READ WRITE");
      try {
        const transactionIdResult = await this.client.query<{ transaction_id: string }>(
          "SELECT txid_current()::text AS transaction_id"
        );
        const transactionId = stringValue(
          requireRow(transactionIdResult, "SETTLEMENT_TRANSACTION_ID_MISSING").transaction_id,
          "transaction_id"
        );

        const tx = this.createTransactionContext(input, transactionId);
        const result = await operation(tx);
        await this.client.query("COMMIT");
        return result;
      } catch (error) {
        await this.rollbackBestEffort();
        if (isTransientTransactionError(error) && attempt < this.retryPolicy.maxAttempts) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("SETTLEMENT_TRANSACTION_RETRY_EXHAUSTED");
  }

  private createTransactionContext(
    input: { organizationId: UUID; idempotencyKey: string; isolation: SettlementIsolation },
    transactionId: string
  ): SettlementTransactionContext & DurableSettlementTx {
    const organizationId = input.organizationId;
    return {
      isolation: input.isolation,
      organizationId,
      transactionId,
      providerEvents: {
        claim: async (provider, eventId, receivedAt) => {
          const result = await this.client.query<{ event_id: string; organization_id: string }>(
            "INSERT INTO provider_events " +
            "(provider, event_id, organization_id, received_at) " +
            "VALUES ($1, $2, $3, $4::timestamptz) " +
            "ON CONFLICT (provider, event_id) DO NOTHING " +
            "RETURNING event_id, organization_id",
            [provider, eventId, organizationId, receivedAt]
          );
          if (result.rowCount > 0) return true;

          const existing = await this.client.query<{ organization_id: string }>(
            "SELECT organization_id FROM provider_events WHERE provider = $1 AND event_id = $2",
            [provider, eventId]
          );
          const row = existing.rows[0];
          if (row && row.organization_id !== organizationId) {
            throw new Error("PROVIDER_EVENT_ORGANIZATION_CONFLICT");
          }
          return false;
        }
      },
      ledger: {
        findByIdempotencyKey: async (orgId, key) => {
          const result = await this.client.query<{ id: string }>(
            "SELECT id FROM ledger_transactions WHERE organization_id = $1 AND idempotency_key = $2",
            [orgId, key]
          );
          const row = result.rows[0];
          return row ? { id: stringValue(row.id, "ledger_transaction_id") } : undefined;
        },
        append: async (input) => {
          if (input.organizationId !== organizationId) {
            throw new Error("LEDGER_ORGANIZATION_MISMATCH");
          }
          assertBalanced(input.lines);
          const result = await this.client.query(
            "INSERT INTO ledger_transactions " +
            "(id, organization_id, idempotency_key, occurred_at, posted_at) " +
            "VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)",
            [input.id, input.organizationId, input.idempotencyKey, input.occurredAt, input.postedAt]
          );
          if (result.rowCount !== 1) throw new Error("LEDGER_TRANSACTION_NOT_INSERTED");

          for (const [index, line] of input.lines.entries()) {
            if (line.amount.minor <= 0n) throw new Error("LEDGER_AMOUNT_INVALID");
            await this.client.query(
              "INSERT INTO ledger_lines " +
              "(organization_id, transaction_id, line_no, account_id, direction, amount_minor, currency) " +
              "VALUES ($1, $2, $3, $4, $5, $6::numeric, $7)",
              [
                input.organizationId,
                input.id,
                index + 1,
                line.accountId,
                line.direction,
                line.amount.minor.toString(),
                line.amount.currency
              ]
            );
          }
        }
      },
      contributions: {
        getForUpdate: async (orgId, contributionId) => {
          const result = await this.client.query<{
            id: string;
            organization_id: string;
            group_id: string;
            membership_id: string;
            amount_minor: string | bigint;
            currency: string;
            idempotency_key: string;
            status: TontineContribution["status"];
            channel: TontineContribution["channel"];
            scheduled_for: string;
            collected_at?: string | null;
          }>(
            "SELECT id, organization_id, group_id, membership_id, amount_minor, currency, " +
            "idempotency_key, status, channel, scheduled_for, collected_at " +
            "FROM tontine_contributions WHERE organization_id = $1 AND id = $2 FOR UPDATE",
            [orgId, contributionId]
          );
          const row = requireRow(result, "TONTINE_CONTRIBUTION_NOT_FOUND");
          return {
            id: row.id as UUID,
            organizationId: row.organization_id as UUID,
            groupId: row.group_id as UUID,
            membershipId: row.membership_id as UUID,
            amountMinor: bigintValue(row.amount_minor, "amount_minor"),
            currency: stringValue(row.currency, "currency"),
            idempotencyKey: stringValue(row.idempotency_key, "idempotency_key"),
            status: row.status,
            channel: row.channel,
            scheduledFor: row.scheduled_for,
            ...(row.collected_at ? { collectedAt: row.collected_at } : {})
          };
        },
        confirm: async (orgId, contributionId, paymentIntentId, providerReference, confirmedAt) => {
          const result = await this.client.query(
            "UPDATE tontine_contributions SET status = 'confirmed', payment_intent_id = $3, " +
            "provider_reference = $4, collected_at = $5::timestamptz, updated_at = $5::timestamptz " +
            "WHERE organization_id = $1 AND id = $2 AND status IN ('scheduled', 'pending')",
            [orgId, contributionId, paymentIntentId, providerReference, confirmedAt]
          );
          if (result.rowCount !== 1) throw new Error("TONTINE_CONTRIBUTION_CONFIRM_REJECTED");
        }
      },
      payments: {
        getForUpdate: async (orgId, paymentIntentId) => {
          const result = await this.client.query<{
            id: string;
            organization_id: string;
            contribution_id: string;
            idempotency_key: string;
            amount_minor: string | bigint;
            currency: string;
            provider: string;
            provider_reference?: string | null;
            status: TontinePaymentIntent["status"];
            created_at: string;
            updated_at: string;
          }>(
            "SELECT id, organization_id, contribution_id, idempotency_key, amount_minor, currency, " +
            "provider, provider_reference, status, created_at, updated_at " +
            "FROM tontine_payment_intents WHERE organization_id = $1 AND id = $2 FOR UPDATE",
            [orgId, paymentIntentId]
          );
          const row = requireRow(result, "TONTINE_PAYMENT_NOT_FOUND");
          return {
            id: row.id as UUID,
            organizationId: row.organization_id as UUID,
            contributionId: row.contribution_id as UUID,
            idempotencyKey: row.idempotency_key,
            amountMinor: bigintValue(row.amount_minor, "amount_minor"),
            currency: row.currency,
            provider: row.provider,
            ...(row.provider_reference ? { providerReference: row.provider_reference } : {}),
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          };
        },
        markSettled: async (orgId, paymentIntentId, settledAt) => {
          const result = await this.client.query(
            "UPDATE tontine_payment_intents SET status = 'settled', updated_at = $3::timestamptz " +
            "WHERE organization_id = $1 AND id = $2 AND status = 'provider_confirmed'",
            [orgId, paymentIntentId, settledAt]
          );
          if (result.rowCount !== 1) throw new Error("TONTINE_PAYMENT_SETTLE_REJECTED");
        }
      },
      fees: {
        insertImmutable: async (snapshot: TontineFeeSnapshot) => {
          const result = await this.client.query(
            "INSERT INTO tontine_fee_snapshots " +
            "(contribution_id, microfinance_fee_minor, tpay_fee_minor, total_fee_minor, currency, rule_version, calculated_at) " +
            "VALUES ($1, $2::numeric, $3::numeric, $4::numeric, $5, $6, $7::timestamptz) " +
            "ON CONFLICT (contribution_id) DO NOTHING",
            [
              snapshot.contributionId,
              snapshot.microfinanceFeeMinor.toString(),
              snapshot.tpayFeeMinor.toString(),
              snapshot.totalFeeMinor.toString(),
              snapshot.currency,
              snapshot.ruleVersion,
              snapshot.calculatedAt
            ]
          );
          if (result.rowCount !== 1) throw new Error("FEE_SNAPSHOT_ALREADY_EXISTS");
        }
      },
      receipts: {
        insert: async (receipt: TontineReceipt) => {
          const result = await this.client.query(
            "INSERT INTO tontine_receipts " +
            "(receipt_id, organization_id, contribution_id, payment_intent_id, provider_reference, amount_minor, currency, issued_at, ledger_transaction_id) " +
            "VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8::timestamptz, $9)",
            [
              receipt.receiptId,
              organizationId,
              receipt.contributionId,
              receipt.paymentIntentId,
              receipt.providerReference,
              receipt.amountMinor.toString(),
              receipt.currency,
              receipt.issuedAt,
              receipt.ledgerTransactionId
            ]
          );
          if (result.rowCount !== 1) throw new Error("RECEIPT_NOT_INSERTED");
        }
      },
      outbox: {
        enqueue: async (input) => {
          const result = await this.client.query(
            "INSERT INTO outbox_events " +
            "(id, organization_id, event_type, aggregate_id, occurred_at, payload) " +
            "VALUES ($1, $2, $3, $4, $5::timestamptz, $6::jsonb) " +
            "ON CONFLICT (id) DO NOTHING",
            [input.id, input.organizationId, input.eventType, input.aggregateId, input.occurredAt, input.payload]
          );
          if (result.rowCount !== 1) throw new Error("OUTBOX_EVENT_NOT_INSERTED");
        }
      }
    };
  }

  private async rollbackBestEffort(): Promise<void> {
    try {
      await this.client.query("ROLLBACK");
    } catch {
      // The original transaction error is authoritative; discard the
      // connection in the pool when rollback itself fails.
    }
  }
}


export interface PostgresOutboxStore {
  claimNext(workerId: string, now: string, leaseUntil: string): Promise<{
    id: string;
    organizationId: UUID;
    eventType: string;
    aggregateId: UUID;
    occurredAt: string;
    payload: string;
    attempts: number;
  } | null>;
  markPublished(id: string, publishedAt: string): Promise<void>;
  markAttemptFailed(id: string, now: string, nextAttemptAt: string): Promise<void>;
}

export class TransactionalPostgresOutboxStore implements PostgresOutboxStore {
  constructor(private readonly client: PostgresClient) {}

  async claimNext(workerId: string, now: string, leaseUntil: string) {
    await this.client.query("BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE");
    try {
      const result = await this.client.query<{
        id: string;
        organization_id: string;
        event_type: string;
        aggregate_id: string;
        occurred_at: string;
        payload: unknown;
        attempts: number;
      }>(
        "WITH candidate AS (" +
        "SELECT id FROM outbox_events " +
        "WHERE published_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= $1::timestamptz) " +
        "AND (claimed_at IS NULL OR claimed_at < $1::timestamptz) " +
        "ORDER BY occurred_at, id FOR UPDATE SKIP LOCKED LIMIT 1" +
        ") " +
        "UPDATE outbox_events o SET claimed_by=$2, claimed_at=$3::timestamptz, attempts=o.attempts+1 " +
        "FROM candidate c WHERE o.id=c.id " +
        "RETURNING o.id,o.organization_id,o.event_type,o.aggregate_id,o.occurred_at,o.payload,o.attempts",
        [now, workerId, leaseUntil]
      );
      await this.client.query("COMMIT");
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organization_id as UUID,
        eventType: row.event_type,
        aggregateId: row.aggregate_id as UUID,
        occurredAt: row.occurred_at,
        payload: typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload),
        attempts: row.attempts
      };
    } catch (error) {
      try { await this.client.query("ROLLBACK"); } catch {}
      throw error;
    }
  }

  async markPublished(id: string, publishedAt: string): Promise<void> {
    const result = await this.client.query(
      "UPDATE outbox_events SET published_at=$2::timestamptz, claimed_by=NULL, claimed_at=NULL " +
      "WHERE id=$1 AND published_at IS NULL",
      [id, publishedAt]
    );
    if (result.rowCount !== 1) throw new Error("OUTBOX_MARK_PUBLISHED_REJECTED");
  }

  async markAttemptFailed(id: string, now: string, nextAttemptAt: string): Promise<void> {
    const result = await this.client.query(
      "UPDATE outbox_events SET claimed_by=NULL, claimed_at=NULL, next_attempt_at=$3::timestamptz " +
      "WHERE id=$1 AND published_at IS NULL AND (claimed_at IS NULL OR claimed_at <= $2::timestamptz)",
      [id, now, nextAttemptAt]
    );
    if (result.rowCount !== 1) throw new Error("OUTBOX_MARK_FAILURE_REJECTED");
  }
}
