import { createHash, randomUUID } from "node:crypto";
import type { PostgresTransactionClient } from "./postgres-sync-fabric.js";
import type { SchoolRealtimeEvent } from "./school-realtime.js";

export interface SchoolMutationScope {
  tenantId: string; organizationId: string; actorId: string;
  requestId: string; route: string; correlationId: string;
}
export interface SchoolOutboxEvent extends SchoolRealtimeEvent {}
export interface SchoolMutationResult<T> { data: T; event: SchoolOutboxEvent; }

const sha=(value:string)=>createHash("sha256").update(value,"utf8").digest("hex");

/**
 * Executes a school mutation and writes its audit + durable event intent on one
 * checked-out PostgreSQL connection. No network publication occurs before COMMIT.
 * The callback MUST use the supplied client, never a pool-level query method.
 */
export class PostgresSchoolMutationUnitOfWork {
  constructor(private readonly client: PostgresTransactionClient) {}

  async execute<T>(
    scope: SchoolMutationScope,
    mutation: (tx: PostgresTransactionClient) => Promise<{data:T; event:Omit<SchoolOutboxEvent,"id"|"tenantId"|"organizationId"> & {id?:string}; responseHash?:string}>
  ): Promise<SchoolMutationResult<T>> {
    if(!scope.tenantId||!scope.organizationId||!scope.actorId||!scope.requestId||!scope.route||!scope.correlationId)
      throw new Error("SCHOOL_MUTATION_SCOPE_REQUIRED");
    await this.client.query("BEGIN");
    try {
      await this.client.query("SELECT set_config('tpay.tenant_id',$1,true), set_config('tpay.organization_id',$2,true)",[scope.tenantId,scope.organizationId]);
      const result=await mutation(this.client);
      const event:SchoolOutboxEvent={
        ...result.event,
        id:result.event.id??randomUUID(),
        tenantId:scope.tenantId,
        organizationId:scope.organizationId
      };
      if(!event.entityId||!event.type||!Number.isSafeInteger(event.version)||event.version<1)
        throw new Error("SCHOOL_OUTBOX_EVENT_INVALID");
      const payload=JSON.stringify({type:event.type,entityId:event.entityId,version:event.version,data:event.data});
      const payloadHash=sha(payload);
      await this.client.query(
        `INSERT INTO api_request_audit
         (id,organization_id,request_id,route,actor_id,auth_class,outcome,correlation_id,occurred_at,metadata_hash)
         VALUES($1,$2,$3,$4,$5,'member','accepted',$6,now(),$7)`,
        [randomUUID(),scope.organizationId,scope.requestId,scope.route,scope.actorId,scope.correlationId,sha(JSON.stringify({eventId:event.id,eventType:event.type,entityId:event.entityId,version:event.version}))]
      );
      await this.client.query(
        `INSERT INTO education_transactional_outbox
         (tenant_id,organization_id,event_id,event_type,entity_id,entity_version,occurred_at,payload,payload_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
         ON CONFLICT(tenant_id,organization_id,event_id) DO NOTHING`,
        [scope.tenantId,scope.organizationId,event.id,event.type,event.entityId,event.version,event.occurredAt,payload,payloadHash]
      );
      if(result.responseHash){
        if(!/^[a-f0-9]{64}$/.test(result.responseHash))throw new Error("SCHOOL_MUTATION_RESPONSE_HASH_INVALID");
        const completed=await this.client.query(
          "UPDATE api_request_deduplication SET state='succeeded',response_hash=$2,status_code=200 WHERE id=$1 AND state='reserved'",
          [scope.requestId,result.responseHash]
        );
        if((completed.rowCount??0)!==1)throw new Error("API_IDEMPOTENCY_COMPLETION_FAILED");
      }
      await this.client.query("COMMIT");
      return {data:result.data,event};
    } catch(error) {
      try { await this.client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    }
  }
}

export interface ClaimedOutboxRow {
  outbox_id:string; tenant_id:string; organization_id:string; event_id:string;
  event_type:string; entity_id:string; entity_version:string; occurred_at:string;
  payload:Record<string,unknown>; attempts:number;
}

/** Claim with a lease; concurrent workers cannot claim the same live lease. */
export async function claimSchoolOutbox(
  client:PostgresTransactionClient, workerId:string, limit=50, leaseSeconds=30
):Promise<ClaimedOutboxRow[]> {
  if(!workerId||workerId.length>128||!Number.isInteger(limit)||limit<1||limit>500||
     !Number.isInteger(leaseSeconds)||leaseSeconds<5||leaseSeconds>600)
    throw new Error("SCHOOL_OUTBOX_CLAIM_ARGUMENT_INVALID");
  const result=await client.query<ClaimedOutboxRow>(
    `WITH candidates AS (
       SELECT outbox_id FROM education_transactional_outbox
        WHERE (state='PENDING' AND available_at<=now())
           OR (state='PROCESSING' AND locked_until<=now())
        ORDER BY available_at,created_at
        FOR UPDATE SKIP LOCKED LIMIT $1
     )
     UPDATE education_transactional_outbox o
        SET state='PROCESSING',locked_by=$2,
            locked_until=now()+($3::text||' seconds')::interval,
            attempts=attempts+1,updated_at=now()
       FROM candidates c WHERE o.outbox_id=c.outbox_id
     RETURNING o.outbox_id,o.tenant_id,o.organization_id,o.event_id,o.event_type,
       o.entity_id,o.entity_version::text,o.occurred_at,o.payload,o.attempts`,
    [limit,workerId,leaseSeconds]
  );
  return result.rows;
}

export async function markSchoolOutboxPublished(
  client:PostgresTransactionClient,outboxId:string,workerId:string
):Promise<void>{
  const r=await client.query(
    `UPDATE education_transactional_outbox SET state='PUBLISHED',published_at=now(),
       locked_by=NULL,locked_until=NULL,last_error_code=NULL,updated_at=now()
      WHERE outbox_id=$1 AND state='PROCESSING' AND locked_by=$2`,
    [outboxId,workerId]
  );
  if((r.rowCount??0)!==1)throw new Error("SCHOOL_OUTBOX_LEASE_LOST");
}

export async function retrySchoolOutbox(
  client:PostgresTransactionClient,outboxId:string,workerId:string,errorCode:string,maxAttempts=12
):Promise<void>{
  if(!/^[A-Z0-9_]{1,80}$/.test(errorCode))throw new Error("SCHOOL_OUTBOX_ERROR_CODE_INVALID");
  const r=await client.query(
    `UPDATE education_transactional_outbox
        SET state=CASE WHEN attempts >= $4 THEN 'DEAD' ELSE 'PENDING' END,
            available_at=now()+LEAST(3600,power(2,LEAST(attempts,10)))::text::interval,
            locked_by=NULL,locked_until=NULL,last_error_code=$3,updated_at=now()
      WHERE outbox_id=$1 AND state='PROCESSING' AND locked_by=$2`,
    [outboxId,workerId,errorCode,maxAttempts]
  );
  if((r.rowCount??0)!==1)throw new Error("SCHOOL_OUTBOX_LEASE_LOST");
}
