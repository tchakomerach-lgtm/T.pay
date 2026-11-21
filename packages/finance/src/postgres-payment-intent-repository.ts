import type { PaymentIntent, PaymentIntentRepository, PaymentIntentState } from "./payment-intent.js";

type PaymentIntentRow = {
  id: string;
  organization_id: string;
  idempotency_key: string;
  payload_hash: string;
  payer_account_id: string;
  payee_account_id: string;
  amount_minor: string | number | bigint;
  currency: string;
  state: string;
  requires_human_approval: boolean;
  approved_by: string | null;
  approved_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export interface PaymentIntentSqlExecutor {
  query<Row = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[]
  ): Promise<{ rows: Row[]; rowCount?: number | null }>;
}

function timestamp(value: string | Date | null): string | undefined {
  if (value === null) return undefined;
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("PAYMENT_INTENT_TIMESTAMP_INVALID");
  return parsed.toISOString();
}

function fromRow(row: PaymentIntentRow): PaymentIntent {
  const state = row.state as PaymentIntentState;
  if (!["pending_approval", "approved", "rejected", "settled", "failed"].includes(state)) {
    throw new Error("PAYMENT_INTENT_STATE_INVALID");
  }
  const intent: PaymentIntent = {
    id: row.id,
    organizationId: row.organization_id,
    idempotencyKey: row.idempotency_key,
    payloadHash: row.payload_hash,
    payerAccountId: row.payer_account_id,
    payeeAccountId: row.payee_account_id,
    amountMinor: BigInt(row.amount_minor),
    currency: row.currency,
    state,
    requiresHumanApproval: row.requires_human_approval,
    createdAt: timestamp(row.created_at as string | Date) as string,
    updatedAt: timestamp(row.updated_at as string | Date) as string
  };
  if (row.approved_by) intent.approvedBy = row.approved_by;
  const approvedAt = timestamp(row.approved_at);
  if (approvedAt) intent.approvedAt = approvedAt;
  return intent;
}

/**
 * PostgreSQL persistence adapter for Financial Core Payment Intents.
 * It persists intent state only; it never posts or settles Ledger entries.
 * Callers must establish the organization RLS context in the surrounding transaction.
 */
export class PostgresPaymentIntentRepository implements PaymentIntentRepository {
  constructor(private readonly db: PaymentIntentSqlExecutor) {}

  async findByIdempotency(organizationId: string, key: string): Promise<PaymentIntent | undefined> {
    const result = await this.db.query<PaymentIntentRow>(
      `SELECT id,organization_id,idempotency_key,payload_hash,payer_account_id,payee_account_id,
              amount_minor,currency,state,requires_human_approval,approved_by,approved_at,created_at,updated_at
       FROM payment_intents
       WHERE organization_id=$1 AND idempotency_key=$2
       LIMIT 1`,
      [organizationId, key]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }

  async insert(intent: PaymentIntent): Promise<PaymentIntent> {
    const result = await this.db.query<PaymentIntentRow>(
      `INSERT INTO payment_intents
       (id,organization_id,idempotency_key,payload_hash,payer_account_id,payee_account_id,
        amount_minor,currency,state,requires_human_approval,approved_by,approved_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (organization_id,idempotency_key) DO NOTHING
       RETURNING id,organization_id,idempotency_key,payload_hash,payer_account_id,payee_account_id,
                 amount_minor,currency,state,requires_human_approval,approved_by,approved_at,created_at,updated_at`,
      [intent.id,intent.organizationId,intent.idempotencyKey,intent.payloadHash,intent.payerAccountId,
       intent.payeeAccountId,intent.amountMinor.toString(),intent.currency,intent.state,
       intent.requiresHumanApproval,intent.approvedBy ?? null,intent.approvedAt ?? null,
       intent.createdAt,intent.updatedAt]
    );
    if (result.rows[0]) return fromRow(result.rows[0]);

    // The unique key serializes concurrent retries. Return only an exact payload replay.
    const existing = await this.findByIdempotency(intent.organizationId, intent.idempotencyKey);
    if (!existing) throw new Error("PAYMENT_INTENT_INSERT_CONFLICT");
    if (existing.payloadHash !== intent.payloadHash) throw new Error("PAYMENT_INTENT_IDEMPOTENCY_CONFLICT");
    return existing;
  }

  async approve(organizationId: string, id: string, approvedBy: string, approvedAt: string): Promise<PaymentIntent | undefined> {
    const result = await this.db.query<PaymentIntentRow>(
      `UPDATE payment_intents
       SET state='approved',approved_by=$3,approved_at=$4,updated_at=$4
       WHERE organization_id=$1 AND id=$2 AND state='pending_approval'
         AND requires_human_approval=true
       RETURNING id,organization_id,idempotency_key,payload_hash,payer_account_id,payee_account_id,
                 amount_minor,currency,state,requires_human_approval,approved_by,approved_at,created_at,updated_at`,
      [organizationId,id,approvedBy,approvedAt]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }

  async reject(organizationId: string, id: string): Promise<PaymentIntent | undefined> {
    const result = await this.db.query<PaymentIntentRow>(
      `UPDATE payment_intents
       SET state='rejected',updated_at=now()
       WHERE organization_id=$1 AND id=$2 AND state='pending_approval'
       RETURNING id,organization_id,idempotency_key,payload_hash,payer_account_id,payee_account_id,
                 amount_minor,currency,state,requires_human_approval,approved_by,approved_at,created_at,updated_at`,
      [organizationId,id]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }
}
