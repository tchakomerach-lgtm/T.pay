import type { PostgresTransactionClient } from "./postgres-sync-fabric.js";
import { claimSchoolOutbox, markSchoolOutboxPublished, retrySchoolOutbox, type ClaimedOutboxRow } from "./postgres-school-mutation-uow.js";
import type { SchoolRealtimeEvent, SchoolRealtimeHub } from "./school-realtime.js";
import type { PostgresSchoolRealtimeStore } from "./postgres-realtime-store.js";

export type SchoolOutboxClientFactory=()=>PostgresTransactionClient|Promise<PostgresTransactionClient>;
export interface SchoolOutboxDispatchResult{claimed:number;published:number;retried:number;dead:number;}

export class PostgresSchoolOutboxDispatcher{
 constructor(
  private readonly clientFactory:SchoolOutboxClientFactory,
  private readonly realtime:SchoolRealtimeHub,
  private readonly realtimeStore:Pick<PostgresSchoolRealtimeStore,"append">
 ){}

 private async scoped<T>(tenantId:string,organizationId:string,work:(client:PostgresTransactionClient)=>Promise<T>):Promise<T>{
  const client=await this.clientFactory();
  try{
   await client.query("BEGIN");
   await client.query("SET LOCAL ROLE tpay_school_runtime");
   await client.query("SELECT set_config('tpay.tenant_id',$1,true),set_config('tpay.organization_id',$2,true)",[tenantId,organizationId]);
   const value=await work(client);
   await client.query("COMMIT");
   return value;
  }catch(error){
   try{await client.query("ROLLBACK");}catch{/* preserve original error */}
   throw error;
  }finally{client.release?.();}
 }

 private event(row:ClaimedOutboxRow):SchoolRealtimeEvent{
  const payload=row.payload??{};
  const data=payload.data;
  if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("SCHOOL_OUTBOX_PAYLOAD_INVALID");
  const type=String(payload.type??row.event_type) as SchoolRealtimeEvent["type"];
  const entityId=String(payload.entityId??row.entity_id);
  const version=Number(payload.version??row.entity_version);
  if(!entityId||!Number.isSafeInteger(version)||version<1)throw new Error("SCHOOL_OUTBOX_EVENT_INVALID");
  return {id:row.event_id,tenantId:row.tenant_id,organizationId:row.organization_id,type,
   occurredAt:new Date(row.occurred_at).toISOString(),entityId,version,data:data as Record<string,unknown>};
 }

 async dispatchScope(tenantId:string,organizationId:string,workerId:string,limit=50):Promise<SchoolOutboxDispatchResult>{
  if(!tenantId||!organizationId||!workerId||!Number.isInteger(limit)||limit<1||limit>500)throw new Error("SCHOOL_OUTBOX_DISPATCH_SCOPE_INVALID");
  const rows=await this.scoped(tenantId,organizationId,client=>claimSchoolOutbox(client,workerId,limit,30));
  const result:SchoolOutboxDispatchResult={claimed:rows.length,published:0,retried:0,dead:0};
  for(const row of rows){
   try{
    const event=this.event(row);
    event.streamSequence=(await this.realtimeStore.append(event)).toString();
    this.realtime.publish(event);
    await this.scoped(tenantId,organizationId,client=>markSchoolOutboxPublished(client,row.outbox_id,workerId));
    result.published++;
   }catch{
    try{
     const state=await this.scoped(tenantId,organizationId,client=>retrySchoolOutbox(client,row.outbox_id,workerId,"SCHOOL_REALTIME_DELIVERY_FAILED"));
     if(state==="DEAD")result.dead++;else result.retried++;
    }catch{/* lease may have expired and been reclaimed by another worker */}
   }
  }
  return result;
 }
}
