export type EdgeDeliveryState="IDLE"|"SENDING"|"BACKOFF"|"UNKNOWN"|"QUARANTINED";
export type EdgeTransportResponse={status:"ACCEPTED"|"DUPLICATE"|"PENDING"|"REJECTED"|"UNKNOWN";acceptedSequence:bigint};
export interface EdgeEnvelope{deviceId:string;tenantId:string;organizationId:string;eventId:string;idempotencyKey:string;actorId:string;eventType:string;schemaVersion:number;priority:number;sequence:bigint;occurredAt:string;payloadHash:string;payload:Record<string,unknown>;}
export interface EdgeTransport{send(envelope:EdgeEnvelope,signal:AbortSignal):Promise<EdgeTransportResponse>;}
export interface EdgeClock{now():number;}
export interface EdgePolicy{maxAttempts:number;requestTimeoutMs:number;baseBackoffMs:number;maxBackoffMs:number;}
export interface EdgeQueue{peek(scope:{deviceId:string;tenantId:string;organizationId:string}):Promise<EdgeEnvelope|undefined>;ack(eventId:string):Promise<void>;quarantine(eventId:string,reason:string):Promise<void>;}
export interface EdgeResult{state:EdgeDeliveryState;attempts:number;eventId?:string;acceptedSequence?:bigint;nextAttemptAt?:number;reason?:string;}
const HEX64=/^[a-f0-9]{64}$/;
export class SchoolEdgeNode{
 constructor(private readonly queue:EdgeQueue,private readonly transport:EdgeTransport,private readonly clock:EdgeClock=Date as any,private readonly policy:EdgePolicy={maxAttempts:5,requestTimeoutMs:10000,baseBackoffMs:250,maxBackoffMs:10000}){this.validatePolicy();}
 private validatePolicy(){if(this.policy.maxAttempts<1||this.policy.requestTimeoutMs<1||this.policy.baseBackoffMs<1||this.policy.maxBackoffMs<this.policy.baseBackoffMs)throw new Error("EDGE_POLICY_INVALID");}
 async drain(scope:{deviceId:string;tenantId:string;organizationId:string}):Promise<EdgeResult>{
  const envelope=await this.queue.peek(scope);if(!envelope)return {state:"IDLE",attempts:0};
  if(envelope.tenantId!==scope.tenantId||envelope.organizationId!==scope.organizationId||envelope.deviceId!==scope.deviceId)throw new Error("EDGE_SCOPE_MISMATCH");
  if(!HEX64.test(envelope.payloadHash)||!envelope.eventId||envelope.sequence<1n)throw new Error("EDGE_ENVELOPE_INVALID");
  let attempts=0;
  while(attempts<this.policy.maxAttempts){
   attempts++;
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.policy.requestTimeoutMs);
   try{
    const response=await this.transport.send(envelope,controller.signal);
    if(response.status==="ACCEPTED"||response.status==="DUPLICATE"){await this.queue.ack(envelope.eventId);return {state:"IDLE",attempts,eventId:envelope.eventId,acceptedSequence:response.acceptedSequence};}
    if(response.status==="PENDING")return {state:"BACKOFF",attempts,eventId:envelope.eventId,acceptedSequence:response.acceptedSequence,nextAttemptAt:this.clock.now()+this.backoff(attempts),reason:"SERVER_PENDING"};
    if(response.status==="REJECTED"){await this.queue.quarantine(envelope.eventId,"SERVER_REJECTED");return {state:"QUARANTINED",attempts,eventId:envelope.eventId,acceptedSequence:response.acceptedSequence,reason:"SERVER_REJECTED"};}
    return {state:"UNKNOWN",attempts,eventId:envelope.eventId,acceptedSequence:response.acceptedSequence,reason:"PROVIDER_OR_NETWORK_UNKNOWN"};
   }catch(error){
    if(attempts>=this.policy.maxAttempts)return {state:"UNKNOWN",attempts,eventId:envelope.eventId,nextAttemptAt:this.clock.now()+this.backoff(attempts),reason:error instanceof Error?error.message:"EDGE_TRANSPORT_UNKNOWN"};
   }finally{clearTimeout(timer);}
   await new Promise(resolve=>setTimeout(resolve,this.backoff(attempts)));
  }
  return {state:"UNKNOWN",attempts,eventId:envelope.eventId,reason:"EDGE_RETRY_EXHAUSTED"};
 }
 private backoff(attempt:number):number{const exp=Math.min(this.policy.maxBackoffMs,this.policy.baseBackoffMs*2**Math.max(0,attempt-1));const jitter=Math.floor(exp*0.2);return exp+Math.floor(Math.random()*(jitter+1));}
}

export function createHttpsEdgeTransport(config:EdgeHttpsConfig):EdgeTransport{
 const base=new URL(config.baseUrl);
 if(base.protocol!=="https:")throw new Error("EDGE_HTTPS_REQUIRED");
 return {send:async(envelope,signal)=>{
  const response=await config.adapter.request({
   url:new URL("/v1/education/sync/events",base).toString(),method:"POST",idempotent:true,correlationId:envelope.eventId,signal,
   headers:{"content-type":"application/json","x-correlation-id":envelope.eventId,"x-idempotency-key":envelope.idempotencyKey},
   body:Buffer.from(JSON.stringify({...envelope,sequence:envelope.sequence.toString()}))
  });
  if(response.state==="UNKNOWN")return {status:"UNKNOWN",acceptedSequence:envelope.sequence};
  if(response.state==="PENDING")return {status:"PENDING",acceptedSequence:envelope.sequence};
  if(response.state==="FAILED")return {status:"REJECTED",acceptedSequence:envelope.sequence};
  let body:any={};try{body=response.body?JSON.parse(Buffer.from(response.body).toString("utf8")):{};}catch{return {status:"UNKNOWN",acceptedSequence:envelope.sequence};}
  const state=body?.data?.state??body?.state;
  if(state==="ACCEPTED")return {status:"ACCEPTED",acceptedSequence:BigInt(body?.data?.acceptedSequence??envelope.sequence)};
  if(state==="DUPLICATE")return {status:"DUPLICATE",acceptedSequence:BigInt(body?.data?.acceptedSequence??envelope.sequence)};
  if(state==="PENDING")return {status:"PENDING",acceptedSequence:BigInt(body?.data?.acceptedSequence??envelope.sequence)};
  return {status:"UNKNOWN",acceptedSequence:envelope.sequence};
 }};
}
