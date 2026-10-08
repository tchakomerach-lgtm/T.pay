import { createHash, randomUUID } from "node:crypto";
import type { OpportunityQueryable, OpportunityTransaction } from "./postgres-repository.js";
import { transitionOpportunity, type OpportunityActorClass, type OpportunityCommand, type OpportunityState } from "./lifecycle.js";

export interface OpportunityTransitionResult {
  readonly opportunityId: string;
  readonly state: OpportunityState;
  readonly version: bigint;
  readonly idempotent: boolean;
}

export class PostgresOpportunityLifecycleRepository {
  public constructor(private readonly db: OpportunityQueryable) {}

  public async transition(input: {
    tenantId: string;
    organizationId: string;
    opportunityId: string;
    actorId: string;
    actorClass: OpportunityActorClass;
    command: OpportunityCommand;
    idempotencyKey: string;
    humanApproval?: boolean;
  }): Promise<OpportunityTransitionResult> {
    const tx = this.db as OpportunityTransaction;
    if (typeof tx.begin !== "function") throw new Error("OPPORTUNITY_TRANSACTION_REQUIRED");
    await tx.begin();
    try {
      const duplicate = await tx.query<any>(
        "SELECT opportunity_id, to_state, (SELECT version FROM opportunities WHERE id=opportunity_id)::text AS version FROM opportunity_state_events WHERE tenant_id=$1 AND organization_id=$2 AND idempotency_key=$3",
        [input.tenantId, input.organizationId, input.idempotencyKey],
      );
      if (duplicate.rows[0]) {
        await tx.commit();
        return {
          opportunityId: duplicate.rows[0].opportunity_id,
          state: duplicate.rows[0].to_state,
          version: BigInt(duplicate.rows[0].version),
          idempotent: true,
        };
      }

      const current = await tx.query<any>(
        "SELECT id, state, version::text AS version FROM opportunities WHERE tenant_id=$1 AND organization_id=$2 AND id=$3 FOR UPDATE",
        [input.tenantId, input.organizationId, input.opportunityId],
      );
      const row = current.rows[0];
      if (!row) throw new Error("OPPORTUNITY_NOT_FOUND");

      const transition = transitionOpportunity({
        current: row.state,
        command: input.command,
        actorClass: input.actorClass,
        humanApproval: input.humanApproval,
      });

      const currentVersion = BigInt(row.version);
      const nextVersion = currentVersion + 1n;
      const eventId = randomUUID();
      const occurredAt = new Date().toISOString();
      const eventHash = createHash("sha256").update(JSON.stringify({
        eventId, tenantId: input.tenantId, organizationId: input.organizationId,
        opportunityId: input.opportunityId, from: transition.from, to: transition.to,
        command: input.command, actorId: input.actorId, actorClass: input.actorClass,
        idempotencyKey: input.idempotencyKey, occurredAt,
      })).digest("hex");

      await tx.query(
        "UPDATE opportunities SET state=$1, version=$2, updated_at=$3 WHERE id=$4 AND tenant_id=$5 AND organization_id=$6 AND version=$7",
        [transition.to, nextVersion.toString(), occurredAt, input.opportunityId, input.tenantId, input.organizationId, currentVersion.toString()],
      );
      await tx.query(
        "INSERT INTO opportunity_state_events (id,tenant_id,organization_id,opportunity_id,from_state,to_state,command,actor_id,actor_class,requires_human_approval,occurred_at,idempotency_key,event_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        [eventId, input.tenantId, input.organizationId, input.opportunityId, transition.from, transition.to, input.command, input.actorId, input.actorClass, transition.requiresHumanApproval, occurredAt, input.idempotencyKey, eventHash],
      );
      await tx.query(
        "INSERT INTO opportunity_event_outbox (id,tenant_id,organization_id,aggregate_id,event_type,payload,occurred_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)",
        [cryptoId(), input.tenantId, input.organizationId, input.opportunityId, "opportunity.state.changed", JSON.stringify({
          opportunityId: input.opportunityId, from: transition.from, to: transition.to,
          command: input.command, actorId: input.actorId, actorClass: input.actorClass,
          version: nextVersion.toString(), eventId,
        }), occurredAt],
      );
      await tx.commit();
      return { opportunityId: input.opportunityId, state: transition.to, version: nextVersion, idempotent: false };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}

function cryptoId(): string {
  return createHash("sha256").update(String(process.hrtime.bigint()) + Math.random()).digest("hex");
}
