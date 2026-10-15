import {createHash} from "node:crypto";
import {AuditChain} from "./audit-chain.js";
import {sanitizeForExposure} from "./fortress-exposure-guard.js";

export interface SecurityEvent { readonly eventType:string; readonly organizationId:string; readonly actorId?:string; readonly agentId?:string; readonly correlationId?:string; readonly severity:"info"|"warn"|"high"|"critical"; readonly timestamp:number; readonly metadata:Record<string,unknown>; }
const SAFE_ID=/^[A-Za-z0-9_.:-]{1,96}$/;
export class SecurityMonitor {
  private available=true;
  private readonly events:SecurityEvent[]=[];
  private readonly auditChain=new AuditChain();
  setAvailable(value:boolean):void{this.available=value;}
  isAvailable():boolean{return this.available;}
  record(event:SecurityEvent):void{
    if(!this.available) throw new Error("SECURITY_MONITOR_UNAVAILABLE");
    if(!SAFE_ID.test(event.organizationId))throw new Error("SECURITY_EVENT_TENANT_ID_INVALID");
    const {actorId:_actorId,agentId:_agentId,correlationId:_correlationId,...base}=event;
    const safe:SecurityEvent={
      ...base,
      eventType:/^[a-z0-9_.:-]{1,100}$/i.test(event.eventType)?event.eventType:"security.event.invalid",
      ...(safeOptionalId(event.actorId)?{actorId:safeOptionalId(event.actorId)!}:{}),
      ...(safeOptionalId(event.agentId)?{agentId:safeOptionalId(event.agentId)!}:{}),
      ...(safeOptionalId(event.correlationId)?{correlationId:safeOptionalId(event.correlationId)!}:{}),
      metadata:redactMetadata(event.metadata,event.organizationId)
    };
    this.events.push(safe);
    this.auditChain.append({timestamp:safe.timestamp,eventType:safe.eventType,organizationId:safe.organizationId,...(safe.actorId?{actorId:safe.actorId}:{}),...(safe.agentId?{agentId:safe.agentId}:{}),...(safe.correlationId?{correlationId:safe.correlationId}:{}),payloadHash:createHash("sha256").update(JSON.stringify(safe.metadata),"utf8").digest("hex")});
    if(this.events.length>10000)this.events.shift();
  }
  snapshot():readonly SecurityEvent[]{return [...this.events];}
  assertOperational():void{if(!this.available)throw new Error("SECURITY_MONITOR_UNAVAILABLE");}
  verifyAuditIntegrity():void{this.auditChain.verify();}
  getAuditRecords(){return this.auditChain.snapshot();}
}
function safeOptionalId(value:string|undefined):string|undefined{return value&&SAFE_ID.test(value)?value:undefined;}
function redactMetadata(input:Record<string,unknown>,organizationId:string):Record<string,unknown>{
  const safe=sanitizeForExposure(input,{channel:"telemetry",organizationId,purpose:"security-event-record",allowedClasses:["internal"],maxBytes:16384});
  return safe.value as Record<string,unknown>;
}
