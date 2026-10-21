import { randomUUID } from "node:crypto";
import type { OpportunityQueryable, OpportunityTransaction } from "./postgres-repository.js";

export interface OpportunityOutboxEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly attempts: number;
}

export interface OpportunityOutboxPublisher {
  publish(event: OpportunityOutboxEvent): Promise<void>;
}

interface OutboxRow {
  id: string;
  tenant_id: string;
  organization_id: string;
  aggregate_id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
}

export interface OutboxDispatchResult {
  readonly claimed: number;
  readonly published: number;
  readonly retried: number;
  readonly quarantined: number;
}

/**
 * At-least-once outbox dispatcher. Consumers must deduplicate by event.id.
 * The claim lease prevents concurrent workers from normally publishing the same
 * row simultaneously; crash recovery may still cause a duplicate after lease expiry.
 */
export class OpportunityOutboxDispatcher {
  public constructor(
    private readonly db: OpportunityQueryable,
    private readonly publisher: OpportunityOutboxPublisher,
    private readonly options: { batchSize?: number; maxAttempts?: number; leaseSeconds?: number } = {},
  ) {}

  public async dispatchBatch(): Promise<OutboxDispatchResult> {
    const batchSize = Math.max(1, Math.min(this.options.batchSize ?? 50, 250));
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 12);
    const leaseSeconds = Math.max(10, this.options.leaseSeconds ?? 60);
    const tx = this.db as OpportunityTransaction;
    if (typeof tx.begin !== "function") throw new Error("OPPORTUNITY_TRANSACTION_REQUIRED");

    await tx.begin();
    let rows: OutboxRow[];
    try {
      const claimed = await tx.query<OutboxRow>(
        `WITH candidates AS (
           SELECT id FROM opportunity_event_outbox
           WHERE published_at IS NULL AND dead_lettered_at IS NULL
             AND available_at <= now()
           ORDER BY occurred_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         UPDATE opportunity_event_outbox AS o
         SET attempts=o.attempts + 1,
             last_attempt_at=now(),
             available_at=now() + ($2::text || ' seconds')::interval
         FROM candidates c
         WHERE o.id=c.id
         RETURNING o.id,o.tenant_id,o.organization_id,o.aggregate_id,o.event_type,o.payload,o.attempts`,
        [batchSize, leaseSeconds],
      );
      rows = claimed.rows;
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }

    let published = 0;
    let retried = 0;
    let quarantined = 0;
    for (const row of rows) {
      try {
        await this.publisher.publish({
          id: row.id,
          tenantId: row.tenant_id,
          organizationId: row.organization_id,
          aggregateId: row.aggregate_id,
          eventType: row.event_type,
          payload: row.payload,
          attempts: row.attempts,
        });
        await this.db.query(
          "UPDATE opportunity_event_outbox SET published_at=now(), last_error=NULL WHERE id=$1 AND published_at IS NULL",
          [row.id],
        );
        published += 1;
      } catch (error) {
        const message = safeErrorMessage(error);
        if (row.attempts >= maxAttempts) {
          await this.db.query(
            "UPDATE opportunity_event_outbox SET dead_lettered_at=now(), last_error=$2 WHERE id=$1 AND published_at IS NULL",
            [row.id, message],
          );
          quarantined += 1;
        } else {
          const delaySeconds = Math.min(3600, 2 ** Math.min(row.attempts, 10));
          await this.db.query(
            "UPDATE opportunity_event_outbox SET available_at=now() + ($2::text || ' seconds')::interval, last_error=$3 WHERE id=$1 AND published_at IS NULL AND dead_lettered_at IS NULL",
            [row.id, delaySeconds, message],
          );
          retried += 1;
        }
      }
    }
    return { claimed: rows.length, published, retried, quarantined };
  }
}

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "unknown publisher error";
  // Avoid storing arbitrary payloads or credentials accidentally included by SDK errors.
  return raw.replace(/\b(token|secret|password|authorization|api[_-]?key)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]").slice(0, 500);
}

export function newOutboxCorrelationId(): string {
  return randomUUID();
}
