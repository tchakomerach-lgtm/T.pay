import type {Client} from "pg";
import {createHash} from "node:crypto";

export interface PersistentSecurityAuditEvent{
 readonly eventId:string;readonly organizationId:string;readonly actorId?:string;readonly agentId?:string;readonly correlationId?:string;
 readonly eventType:string;readonly severity:"info"|"warn"|"high"|"critical";readonly timestamp:number;readonly payloadHash:string;
}

const GENESIS_PREFIX="T.PAY:SECURITY_AUDIT:GENESIS:v1:";

function genesisHash(organizationId:string):string{
 return createHash("sha256").update(GENESIS_PREFIX+organizationId,"utf8").digest("hex");
}

function recordHash(event:PersistentSecurityAuditEvent,previousHash:string):string{
 const material=[event.eventId,event.organizationId,event.actorId??"",event.agentId??"",event.correlationId??"",event.eventType,event.severity,String(event.timestamp),event.payloadHash,previousHash].join("|");
 return createHash("sha256").update(material,"utf8").digest("hex");
}

/**
 * Persistent audit appends are serialized per organization inside a DB transaction.
 * The caller cannot select an arbitrary predecessor and create a competing chain.
 */
export class PostgresSecurityAuditStore{
 constructor(private readonly client:Client){}

 async append(event:PersistentSecurityAuditEvent,expectedPreviousHash?:string):Promise<string>{
  if(!event.organizationId.trim()||!event.eventType.trim()||!event.payloadHash.trim())throw new Error("SECURITY_AUDIT_CONTEXT_REQUIRED");
  if(!Number.isSafeInteger(event.timestamp)||event.timestamp<=0)throw new Error("SECURITY_AUDIT_TIMESTAMP_INVALID");
  await this.client.query("BEGIN");
  try{
   await this.client.query("SELECT set_config('tpay.organization_id',$1,true)",[event.organizationId]);
   await this.client.query("SELECT set_config('tpay.actor_id',$1,true)",[event.actorId??"system"]);
   await this.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[event.organizationId]);
   const latest=await this.client.query<{record_hash:string}>(
    `SELECT record_hash FROM security_audit_events
     WHERE organization_id=$1 ORDER BY sequence_id DESC LIMIT 1`,
    [event.organizationId]
   );
   const previousHash=latest.rowCount===1?latest.rows[0].record_hash:genesisHash(event.organizationId);
   if(expectedPreviousHash!==undefined&&expectedPreviousHash!==previousHash)throw new Error("SECURITY_AUDIT_PREVIOUS_HASH_MISMATCH");
   const hash=recordHash(event,previousHash);
   await this.client.query(
    `INSERT INTO security_audit_events
     (event_id,organization_id,actor_id,agent_id,correlation_id,event_type,severity,event_timestamp,payload_hash,previous_hash,record_hash)
     VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),$9,$10,$11)`,
    [event.eventId,event.organizationId,event.actorId??null,event.agentId??null,event.correlationId??null,event.eventType,event.severity,event.timestamp,event.payloadHash,previousHash,hash]
   );
   await this.client.query("COMMIT");
   return hash;
  }catch(error){
   await this.client.query("ROLLBACK");
   throw error;
  }
 }

 async verifyOrganization(organizationId:string):Promise<void>{
  if(!organizationId.trim())throw new Error("SECURITY_AUDIT_ORGANIZATION_REQUIRED");
  await this.client.query("BEGIN");
  try{
   await this.client.query("SELECT set_config('tpay.organization_id',$1,true)",[organizationId]);
   const rows=await this.client.query<{event_id:string;organization_id:string;actor_id:string|null;agent_id:string|null;correlation_id:string|null;event_type:string;severity:string;event_timestamp:string;payload_hash:string;previous_hash:string;record_hash:string}>(
    `SELECT event_id,organization_id,actor_id,agent_id,correlation_id,event_type,severity,event_timestamp,payload_hash,previous_hash,record_hash
     FROM security_audit_events WHERE organization_id=$1 ORDER BY sequence_id`,
    [organizationId]
   );
   let previous=genesisHash(organizationId);
   for(const row of rows.rows){
    if(row.previous_hash!==previous)throw new Error("SECURITY_AUDIT_CHAIN_BROKEN");
    const ts=Date.parse(row.event_timestamp);
    const event:PersistentSecurityAuditEvent={
     eventId:row.event_id,organizationId:row.organization_id,
     ...(row.actor_id?{actorId:row.actor_id}:{}),
     ...(row.agent_id?{agentId:row.agent_id}:{}),
     ...(row.correlation_id?{correlationId:row.correlation_id}:{}),
     eventType:row.event_type,severity:row.severity as PersistentSecurityAuditEvent["severity"],
     timestamp:ts,payloadHash:row.payload_hash
    };
    const expected=recordHash(event,row.previous_hash);
    if(expected!==row.record_hash)throw new Error("SECURITY_AUDIT_RECORD_TAMPERED");
    previous=row.record_hash;
   }
   await this.client.query("COMMIT");
  }catch(error){
   await this.client.query("ROLLBACK");
   throw error;
  }
 }
}
