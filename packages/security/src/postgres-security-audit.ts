import type {Client} from "pg";
import {createHash} from "node:crypto";
export interface PersistentSecurityAuditEvent{
 readonly eventId:string;readonly organizationId:string;readonly actorId?:string;readonly agentId?:string;readonly correlationId?:string;
 readonly eventType:string;readonly severity:"info"|"warn"|"high"|"critical";readonly timestamp:number;readonly payloadHash:string;
}
export class PostgresSecurityAuditStore{
 constructor(private readonly client:Client){}
 async append(event:PersistentSecurityAuditEvent,previousHash:string):Promise<string>{
  if(!event.organizationId.trim()||!event.eventType.trim()||!event.payloadHash.trim())throw new Error("SECURITY_AUDIT_CONTEXT_REQUIRED");
  if(!previousHash.trim())throw new Error("SECURITY_AUDIT_PREVIOUS_HASH_REQUIRED");
  const material=[event.eventId,event.organizationId,event.actorId??"",event.agentId??"",event.correlationId??"",event.eventType,event.severity,String(event.timestamp),event.payloadHash,previousHash].join("|");
  const recordHash=createHash("sha256").update(material,"utf8").digest("hex");
  await this.client.query(
   `INSERT INTO security_audit_events
    (event_id,organization_id,actor_id,agent_id,correlation_id,event_type,severity,event_timestamp,payload_hash,previous_hash,record_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),$9,$10,$11)`,
   [event.eventId,event.organizationId,event.actorId??null,event.agentId??null,event.correlationId??null,event.eventType,event.severity,event.timestamp,event.payloadHash,previousHash,recordHash]
  );
  return recordHash;
 }
 async verifyOrganization(organizationId:string):Promise<void>{
  const rows=await this.client.query<{event_id:string;organization_id:string;actor_id:string|null;agent_id:string|null;correlation_id:string|null;event_type:string;severity:string;event_timestamp:string;payload_hash:string;previous_hash:string;record_hash:string}>(`SELECT event_id,organization_id,actor_id,agent_id,correlation_id,event_type,severity,event_timestamp,payload_hash,previous_hash,record_hash FROM security_audit_events WHERE organization_id=$1 ORDER BY sequence_id`,[organizationId]);
  let previous="";
  for(const row of rows.rows){
   if(row.previous_hash!==previous)throw new Error("SECURITY_AUDIT_CHAIN_BROKEN");
   const ts=Date.parse(row.event_timestamp);
   const material=[row.event_id,row.organization_id,row.actor_id??"",row.agent_id??"",row.correlation_id??"",row.event_type,row.severity,String(ts),row.payload_hash,row.previous_hash].join("|");
   const expected=createHash("sha256").update(material,"utf8").digest("hex");
   if(expected!==row.record_hash)throw new Error("SECURITY_AUDIT_RECORD_TAMPERED");
   previous=row.record_hash;
  }
 }
}