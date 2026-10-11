import { createHmac, timingSafeEqual } from "node:crypto";

export type SecureHttpState = "CONFIRMED"|"PENDING"|"FAILED"|"UNKNOWN";
export type SecureHttpResponse = { state:SecureHttpState; status:number|null; body:Uint8Array|null; retryable:boolean; attempts:number; correlationId:string };

export type HttpsRequest = {
  url:string; method:"GET"|"POST"|"PUT"|"PATCH"|"DELETE";
  headers:Record<string,string>; body?:Uint8Array; signal:AbortSignal;
};
export type HttpsResponse = { status:number; headers:Record<string,string>; body:Uint8Array };
export type HttpsTransport = (request:HttpsRequest)=>Promise<HttpsResponse>;

export type AllowedEndpoint = { origin:string; pathPrefix:string };
export type Clock = ()=>number;

const RETRYABLE_STATUS=new Set([408,425,429,500,502,503,504]);
const FORBIDDEN_HEADERS=new Set(["host","connection","upgrade","transfer-encoding","content-length"]);

export function createFetchHttpsTransport():HttpsTransport{
  return async request=>{
    if(new URL(request.url).protocol!=="https:")throw new Error("HTTPS_REQUIRED");
    const init:RequestInit={method:request.method,headers:request.headers,signal:request.signal,redirect:"error"};
    if(request.body!==undefined)init.body=Buffer.from(request.body);
    const response=await fetch(request.url,init);
    return {status:response.status,headers:Object.fromEntries(response.headers.entries()),body:new Uint8Array(await response.arrayBuffer())};
  };
}

export class CircuitBreaker{
  private failures=0; private openedAt=0; private halfOpen=false;
  constructor(private readonly threshold=3,private readonly cooldownMs=30000,private readonly now:Clock=()=>Date.now()){
    if(threshold<1||cooldownMs<1)throw new Error("CIRCUIT_INVALID_CONFIGURATION");
  }
  allow():boolean{
    if(this.openedAt===0)return true;
    if(this.now()-this.openedAt>=this.cooldownMs){this.halfOpen=true;return true;}
    return false;
  }
  success():void{this.failures=0;this.openedAt=0;this.halfOpen=false;}
  failure():void{
    if(this.halfOpen){this.openedAt=this.now();this.halfOpen=false;return;}
    this.failures++;
    if(this.failures>=this.threshold)this.openedAt=this.now();
  }
}

export class SecureHttpsAdapter{
  constructor(
    private readonly endpoints:readonly AllowedEndpoint[],
    private readonly transport:HttpsTransport=createFetchHttpsTransport(),
    private readonly breaker=new CircuitBreaker(),
    private readonly timeoutMs=10000,
    private readonly maxAttempts=3,
    private readonly sleep:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
    private readonly random=()=>Math.random()
  ){}
  async request(input:Omit<HttpsRequest,"signal"> & {idempotent:boolean;correlationId:string;signal?:AbortSignal}):Promise<SecureHttpResponse>{
    const url=new URL(input.url);
    if(url.protocol!=="https:")throw new Error("HTTPS_REQUIRED");
    if(!this.endpoints.some(e=>{const prefix=e.pathPrefix.endsWith("/")?e.pathPrefix:e.pathPrefix+"/";return url.origin===e.origin&&(url.pathname===e.pathPrefix||url.pathname.startsWith(prefix));}))throw new Error("ENDPOINT_NOT_ALLOWLISTED");
    for(const name of Object.keys(input.headers))if(FORBIDDEN_HEADERS.has(name.toLowerCase()))throw new Error("FORBIDDEN_HTTP_HEADER");
    const attempts=Math.max(1,Math.min(5,this.maxAttempts));
    let lastStatus:number|null=null;
    for(let attempt=1;attempt<=attempts;attempt++){
      if(!this.breaker.allow())return {state:"UNKNOWN",status:null,body:null,retryable:true,attempts:attempt-1,correlationId:input.correlationId};
      const controller=new AbortController();
      const abortFromCaller=()=>controller.abort();
      if(input.signal?.aborted) return {state:"UNKNOWN",status:null,body:null,retryable:true,attempts:attempt-1,correlationId:input.correlationId};
      input.signal?.addEventListener("abort",abortFromCaller,{once:true});
      const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
      try{
        const response=await this.transport({...input,signal:controller.signal});
        lastStatus=response.status;
        if(response.status>=200&&response.status<300){this.breaker.success();return {state:"CONFIRMED",status:response.status,body:response.body,retryable:false,attempts:attempt,correlationId:input.correlationId};}
        const retryable=RETRYABLE_STATUS.has(response.status);
        if(!retryable||!input.idempotent){this.breaker.failure();return {state:response.status===409?"PENDING":"FAILED",status:response.status,body:response.body,retryable,attempts:attempt,correlationId:input.correlationId};}
        this.breaker.failure();
      }catch{
        this.breaker.failure();
        if(!input.idempotent)return {state:"UNKNOWN",status:lastStatus,body:null,retryable:true,attempts:attempt,correlationId:input.correlationId};
      }finally{clearTimeout(timer);input.signal?.removeEventListener("abort",abortFromCaller);}
      if(attempt<attempts)await this.sleep(Math.min(2000,250*2**(attempt-1)+Math.floor(this.random()*100)));
    }
    return {state:"UNKNOWN",status:lastStatus,body:null,retryable:true,attempts,correlationId:input.correlationId};
  }
}

export interface WebhookReplayStore{has(nonce:string):Promise<boolean>;remember(nonce:string,expiresAt:number):Promise<void>}

export async function verifySignedWebhook(input:{
  rawBody:Uint8Array; signature:string; nonce:string; secret:Uint8Array; nowMs:number; maxAgeMs?:number; replayStore:WebhookReplayStore;
}):Promise<void>{
  const maxAgeMs=input.maxAgeMs??300000;
  if(!input.nonce)throw new Error("WEBHOOK_NONCE_REQUIRED");
  const parts=Object.fromEntries(input.signature.split(",").map(part=>part.split("=",2)));
  const timestamp=Number(parts.t);
  const supplied=parts.v1??"";
  if(!Number.isInteger(timestamp)||!supplied)throw new Error("WEBHOOK_SIGNATURE_INVALID");
  const age=Math.abs(input.nowMs-(timestamp*1000));
  if(age>maxAgeMs)throw new Error("WEBHOOK_TIMESTAMP_EXPIRED");
  const expected=createHmac("sha256",input.secret).update(String(timestamp)).update(".").update(input.nonce).update(".").update(Buffer.from(input.rawBody)).digest("hex");
  const a=Buffer.from(supplied,"hex"); const b=Buffer.from(expected,"hex");
  if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error("WEBHOOK_SIGNATURE_INVALID");
  if(await input.replayStore.has(input.nonce))throw new Error("WEBHOOK_REPLAY_DETECTED");
  await input.replayStore.remember(input.nonce,timestamp*1000+maxAgeMs);
}
