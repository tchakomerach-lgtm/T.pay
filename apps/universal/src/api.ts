import { Platform } from "react-native";
import {
  ClientObservability,
  DEFAULT_RETRY_POLICY,
  fetchWithRetry,
  isNative,
  makeIdempotencyKey,
  OfflineOutbox,
  RuntimeCache,
  type ClientMetric,
  type RetryPolicy,
} from "./runtime";

export type Health = { ready:boolean; checks?:Array<{name:string;ok:boolean}> };
export type AuthResponse = { userId:string; csrfToken:string; expiresAt:string; sessionToken?:string };
export type Organization = { id:string; name:string; type:string; status:string; roleId:string; roleName:string; membershipStatus:string };
export type CursorPage<T> = { items:T[]; nextCursor:string|null };

export class TPayApi {
  private sessionToken:string|undefined;
  private csrfToken:string|undefined;
  private readonly cache = new RuntimeCache();
  private outbox = new OfflineOutbox("anonymous");
  private readonly telemetry = new ClientObservability();
  private readonly retryPolicy: RetryPolicy;

  constructor(private readonly baseUrl:string, options:{retryPolicy?:Partial<RetryPolicy>}={}) {
    if(!/^https:\/\//.test(baseUrl)) throw new Error("API_HTTPS_REQUIRED");
    this.retryPolicy = {...DEFAULT_RETRY_POLICY, ...options.retryPolicy};
  }

  setSession(token:string|undefined,csrfToken?:string,userId?:string):void{ this.sessionToken=token; if(csrfToken!==undefined)this.csrfToken=csrfToken; if(userId)this.outbox=new OfflineOutbox(userId); }
  clearSession():void{this.sessionToken=undefined;this.csrfToken=undefined;}
  getSessionToken():string|undefined{return this.sessionToken;}
  metrics():ClientMetric[]{return this.telemetry.snapshot();}

  async health():Promise<Health>{ return this.request<Health>("/v1/health"); }

  async register(input:{loginIdentifier:string;displayName:string;password:string}):Promise<AuthResponse>{
    const result=await this.request<AuthResponse>("/v1/auth/register",{method:"POST",body:JSON.stringify(input)});
    this.setSession(result.sessionToken,result.csrfToken,result.userId); return result;
  }

  async login(input:{loginIdentifier:string;password:string}):Promise<AuthResponse>{
    const result=await this.request<AuthResponse>("/v1/auth/login",{method:"POST",body:JSON.stringify(input)});
    this.setSession(result.sessionToken,result.csrfToken); return result;
  }

  async organizations(cursor?:string):Promise<CursorPage<Organization>>{
    const key="organizations:"+String(cursor??"");
    const cached=await this.cache.get<CursorPage<Organization>>(key); if(cached)return cached;
    const query=cursor?"?cursor="+encodeURIComponent(cursor):"";
    const result=await this.request<CursorPage<Organization>>("/v1/organizations"+query);
    await this.cache.set(key,result,15_000); return result;
  }

  async openOrganizationSession(organizationId:string,accessCode:string):Promise<{organizationId:string;expiresAt:string}>{
    return this.request<{organizationId:string;expiresAt:string}>("/v1/organizations/"+encodeURIComponent(organizationId)+"/session",{method:"POST",body:JSON.stringify({accessCode}),headers:{"idempotency-key":makeIdempotencyKey()}});
  }

  async createOrganization(input:{name:string;type:string;accessCode:string}):Promise<{organizationId:string;roleId:string}>{
    return this.mutate<{organizationId:string;roleId:string}>("/v1/organizations","POST",input,makeIdempotencyKey(),{financial:false});
  }

  async me():Promise<{userId:string;displayName:string}>{ return this.request("/v1/auth/me"); }

  async logout():Promise<void>{ await this.request("/v1/auth/logout",{method:"POST"}); this.clearSession(); }

  async sync():Promise<{processed:number;remaining:number}>{
    const items=await this.outbox.list(); let processed=0;
    for(const item of items){
      try{
        await this.request(item.path,{method:item.method,body:item.body,headers:{"idempotency-key":item.idempotencyKey}});
        await this.outbox.remove(item.id); processed++;
      }catch{break;}
    }
    return {processed,remaining:(await this.outbox.list()).length};
  }

  async flushTelemetry():Promise<void>{
    await this.telemetry.flush(async events=>{
      if(!this.sessionToken && !isNative()) return;
      await this.request("/v1/client/telemetry",{method:"POST",body:JSON.stringify({events})});
    });
  }

  private async mutate<T>(path:string,method:"POST"|"PATCH"|"PUT"|"DELETE",value:unknown,idempotencyKey:string,options:{financial:boolean}):Promise<T>{
    if(options.financial) throw new Error("CLIENT_FINANCIAL_MUTATION_FORBIDDEN");
    try{
      return await this.request<T>(path,{method,body:JSON.stringify(value),headers:{"idempotency-key":idempotencyKey}});
    }catch(error){
      if(!isNetworkError(error)) throw error;
      await this.outbox.enqueue({id:makeIdempotencyKey(),path,method,body:JSON.stringify(value),idempotencyKey,createdAt:new Date().toISOString()});
      this.telemetry.record({name:"offline.enqueue",at:new Date().toISOString(),queued:true,attributes:{path}});
      throw new Error("OFFLINE_QUEUED");
    }
  }

  private async request<T>(path:string,init:RequestInit={}):Promise<T>{
    const started=Date.now();
    const headers:Record<string,string>={"content-type":"application/json",Accept:"application/json"};
    if(init.headers)Object.assign(headers,init.headers);
    if(Platform.OS!=="web") headers["x-tpay-client"]="native";
    if(this.sessionToken&&Platform.OS!=="web") headers.Authorization="Bearer "+this.sessionToken;
    if(Platform.OS==="web"&&this.csrfToken&&init.method&&init.method!=="GET") headers["x-csrf-token"]=this.csrfToken;
    try{
      const result=await fetchWithRetry(this.baseUrl+path,{...init,credentials:"include",headers},this.retryPolicy);
      const body=await result.response.json().catch(()=>({}));
      this.telemetry.record({name:"api.request",at:new Date().toISOString(),durationMs:Date.now()-started,status:result.response.status,retryCount:result.retryCount,attributes:{path,method:init.method??"GET"}});
      if(!result.response.ok) throw new Error(String((body as {error?:{message?:string}}).error?.message ?? "API_REQUEST_FAILED"));
      return (body as {data:T}).data;
    }catch(error){
      this.telemetry.record({name:"api.error",at:new Date().toISOString(),durationMs:Date.now()-started,attributes:{path}});
      throw error;
    }
  }
}

function isNetworkError(error:unknown):boolean{
  if(!(error instanceof Error)) return false;
  return /network|fetch|failed to fetch|offline|ECONN|ENOTFOUND|ETIMEDOUT/i.test(error.message);
}
