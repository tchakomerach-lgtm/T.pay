import {createHash} from "node:crypto";
import {AuditChain} from "./audit-chain.js";

export interface SecurityEvent { readonly eventType:string; readonly organizationId:string; readonly actorId?:string; readonly agentId?:string; readonly correlationId?:string; readonly severity:"info"|"warn"|"high"|"critical"; readonly timestamp:number; readonly metadata:Record<string,unknown>; }
export class SecurityMonitor {
  private available=true;
  private readonly events:SecurityEvent[]=[];
  private readonly auditChain=new AuditChain();
  setAvailable(value:boolean):void{this.available=value;}
  isAvailable():boolean{return this.available;}
  record(event:SecurityEvent):void{
    if(!this.available) throw new Error("SECURITY_MONITOR_UNAVAILABLE");
    const safe={...event,metadata:redactMetadata(event.metadata)};
    this.events.push(safe);
    this.auditChain.append({timestamp:safe.timestamp,eventType:safe.eventType,organizationId:safe.organizationId,...(safe.actorId?{actorId:safe.actorId}:{}),...(safe.agentId?{agentId:safe.agentId}:{}),...(safe.correlationId?{correlationId:safe.correlationId}:{}),payloadHash:createHash("sha256").update(JSON.stringify(safe.metadata),"utf8").digest("hex")});
    if(this.events.length>10000)this.events.shift();
  }
  snapshot():readonly SecurityEvent[]{return [...this.events];}
  assertOperational():void{if(!this.available)throw new Error("SECURITY_MONITOR_UNAVAILABLE");}
  verifyAuditIntegrity():void{this.auditChain.verify();}
  getAuditRecords(){return this.auditChain.snapshot();}
}
function redactMetadata(input:Record<string,unknown>):Record<string,unknown>{
  const blocked=/token|secret|password|authorization|cookie|private.?key|api.?key/i;
  return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,blocked.test(k)?"[REDACTED]":v]));
}