export type OutboxDispatchState="PENDING"|"CLAIMED"|"SENT"|"FAILED"|"UNKNOWN";
export interface EducationOutboxRow{id:string;tenantId:string;organizationId:string;eventId:string;eventType:string;payload:unknown;payloadHash:string;attempts:number;occurredAt:string;}
export interface DispatchDb{query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[];rowCount:number|null}>;}
export interface OutboxTransport{send(row:EducationOutboxRow):Promise<"SENT"|"FAILED"|"UNKNOWN">;}
export class PostgresEducationOutboxDispatcher{
 constructor(private readonly db:DispatchDb){}
 async claim(tenantId:string,organizationId:string,workerId:string,now:string,leaseSeconds=30):Promise<EducationOutboxRow|undefined>{
  if(!tenantId||!organizationId||!workerId||leaseSeconds<1)throw new Error("OUTBOX_CLAIM_INVALID");
  const r=await this.db.query<EducationOutboxRow>(`WITH candidate AS (
    SELECT id FROM education_sync_outbox
    WHERE tenant_id=$1 AND organization_id=$2
      AND (dispatch_state='PENDING' OR (dispatch_state='CLAIMED' AND claimed_at < $4::timestamptz))
    ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE education_sync_outbox o
     SET dispatch_state='CLAIMED',claimed_by=$3,claimed_at=$4::timestamptz,
         attempts=o.attempts+1
   WHERE o.id IN (SELECT id FROM candidate)
  RETURNING o.id,o.tenant_id AS "tenantId",o.organization_id AS "organizationId",
            o.event_id AS "eventId",o.event_type AS "eventType",o.payload,
            o.payload_hash AS "payloadHash",o.attempts,o.occurred_at AS "occurredAt"`,[tenantId,organizationId,workerId,now]);
  return r.rows[0];
 }
 async complete(id:string,workerId:string,state:Exclude<OutboxDispatchState,"PENDING"|"CLAIMED">,now:string,error?:string):Promise<boolean>{
  if(!id||!workerId)throw new Error("OUTBOX_COMPLETE_INVALID");
  const r=await this.db.query(`UPDATE education_sync_outbox SET dispatch_state=$3,last_error=$4,
    sent_at=CASE WHEN $3='SENT' THEN $5::timestamptz ELSE sent_at END,claimed_by=NULL,claimed_at=NULL
    WHERE id=$1 AND claimed_by=$2 AND dispatch_state='CLAIMED'`,[id,workerId,state,error??null,now]);
  return (r.rowCount??0)===1;
 }
 async dispatchOne(tenantId:string,organizationId:string,workerId:string,now:string,transport:OutboxTransport):Promise<OutboxDispatchState>{
  const row=await this.claim(tenantId,organizationId,workerId,now);if(!row)return "PENDING";
  try{const state=await transport.send(row);await this.complete(row.id,workerId,state,now,state==="FAILED"?"TRANSPORT_FAILED":state==="UNKNOWN"?"TRANSPORT_UNKNOWN":undefined);return state;}
  catch{await this.complete(row.id,workerId,"UNKNOWN",now,"TRANSPORT_UNKNOWN");return "UNKNOWN";}
 }
}
