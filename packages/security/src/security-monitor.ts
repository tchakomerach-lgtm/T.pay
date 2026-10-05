export interface SecurityEvent { readonly eventType:string; readonly organizationId:string; readonly actorId?:string; readonly agentId?:string; readonly correlationId?:string; readonly severity:"info"|"warn"|"high"|"critical"; readonly timestamp:number; readonly metadata:Record<string,unknown>; }
export class SecurityMonitor {
  private available=true;
  private readonly events:SecurityEvent[]=[];
  setAvailable(value:boolean):void{this.available=value;}
  isAvailable():boolean{return this.available;}
  record(event:SecurityEvent):void{
    if(!this.available) throw new Error("SECURITY_MONITOR_UNAVAILABLE");
    this.events.push({...event,metadata:redactMetadata(event.metadata)});
    if(this.events.length>10000)this.events.shift();
  }
  snapshot():readonly SecurityEvent[]{return [...this.events];}
  assertOperational():void{if(!this.available)throw new Error("SECURITY_MONITOR_UNAVAILABLE");}
}
function redactMetadata(input:Record<string,unknown>):Record<string,unknown>{
  const blocked=/token|secret|password|authorization|cookie|private.?key|api.?key/i;
  return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,blocked.test(k)?"[REDACTED]":v]));
}