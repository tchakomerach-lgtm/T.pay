import { createHash, randomUUID } from "node:crypto";
import { createServer as createHttpsServer, type Server } from "node:https";
import { readFileSync } from "node:fs";
import { ApiAbuseRepository, type RateDb } from "../../../packages/api-gateway/src/rate-abuse.js";
import { ApiRuntimeGate } from "../../../packages/api-gateway/src/runtime-gate.js";
import { buildApiError, buildApiSuccess } from "../../../packages/api-gateway/src/api-contract.js";
import { runHealthProbes } from "../../../packages/api-gateway/src/health.js";
import pg from "pg";
import { assertCsrf, loginWithPassword, logout, registerWithPassword, resolveSession, buildSessionCookie } from "../../../packages/identity/src/postgres.js";

class MemoryRateDb implements RateDb {
  private readonly buckets = new Map<string,{count:number;windowStartedAt:string;max:number;seconds:number}>();
  async query(sql:string, values:unknown[]=[]):Promise<{rows:Record<string,unknown>[];rowCount:number}> {
    if(sql.includes("api_rate_limit_buckets")){
      const v=values as [string,string,string,number,number,string];
      const key=v[0]+"|"+v[1], existing=this.buckets.get(key);
      const next=!existing||existing.windowStartedAt<v[2]
        ? {count:1,windowStartedAt:v[2],max:v[3],seconds:v[4]}
        : {...existing,count:existing.count+1,max:v[3],seconds:v[4]};
      this.buckets.set(key,next);
      return {rows:[{request_count:next.count,max_requests:next.max,window_started_at:next.windowStartedAt,window_seconds:next.seconds}],rowCount:1};
    }
    return {rows:[],rowCount:0};
  }
}

function parseCookies(value:string|undefined):Record<string,string>{
  const out:Record<string,string>={};
  for(const item of (value??"").split(";")){
    const i=item.indexOf("=");
    if(i>0)out[item.slice(0,i).trim()]=decodeURIComponent(item.slice(i+1).trim());
  }
  return out;
}
function json(res:import("node:http").ServerResponse,status:number,body:unknown,extra:Record<string,string>={}){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","x-frame-options":"DENY","referrer-policy":"no-referrer","cross-origin-opener-policy":"same-origin","cross-origin-resource-policy":"same-origin","content-security-policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",...extra});
  res.end(JSON.stringify(body));
}
function safeJson(payload:string):Record<string,unknown>|null{
  try{const value=JSON.parse(payload);return value&&typeof value==="object"?value:null;}catch{return null;}
}

export function createApiServer(input:{tlsKey:string;tlsCert:string;port?:number;databaseUrl?:string}):{server:Server;port:number}{
  if(!input.tlsKey||!input.tlsCert)throw new Error("TLS_CERTIFICATE_REQUIRED");
  const databaseUrl=input.databaseUrl??process.env.TPAY_DATABASE_URL;
  const pool=databaseUrl?new pg.Pool({connectionString:databaseUrl,max:20}):undefined;
  const gate=new ApiRuntimeGate(new ApiAbuseRepository(new MemoryRateDb()));

  const server=createHttpsServer(
    {key:readFileSync(input.tlsKey),cert:readFileSync(input.tlsCert),minVersion:"TLSv1.3"},
    async(req,res)=>{
      const origin=String(req.headers.origin??"");
      const nativeClient=String(req.headers["x-tpay-client"]??"").toLowerCase()==="native";
      const bearer=/^Bearer\s+(.+)$/i.exec(String(req.headers.authorization??""))?.[1];
      const correlationId=String(req.headers["x-correlation-id"]??randomUUID());
      const method=req.method??"GET";
      const url=new URL(req.url??"/","https://tpay.local");

      try{
        if(url.pathname==="/v1/health"&&method==="GET"){
          const report=await runHealthProbes([
            {name:"api-server",check:async()=>true},
            {name:"api-runtime-gate",check:async()=>true},
            {name:"postgres",check:async()=>{if(!pool)return false;await pool.query("SELECT 1");return true;}}
          ]);
          json(res,report.ready?200:503,buildApiSuccess("v1",correlationId,report),{"strict-transport-security":"max-age=63072000; includeSubDomains"});
          return;
        }

        let payload="";
        for await(const chunk of req){
          payload+=chunk.toString();
          if(Buffer.byteLength(payload)>64*1024){json(res,413,{status:413,code:"PAYLOAD_TOO_LARGE",correlationId});return;}
        }

        const cookies=parseCookies(req.headers.cookie);
        const sessionToken=nativeClient&&bearer?bearer:cookies["__Host-tpay_session"];
        let userId:string|undefined;
        let authClass:"anonymous"|"user"="anonymous";
        if(sessionToken&&pool){
          try{const session=await resolveSession(pool,sessionToken);userId=session.userId;authClass="user";}catch{}
        }

        const channel=nativeClient&&!origin?"mobile":"web";
        const decision=await gate.evaluate({
          method,route:url.pathname,authClass,channel,origin,correlationId,
          scopeSecrets:{ip:String(req.socket.remoteAddress??"unknown"),channel,
            ...(authClass==="user"?{actor:userId??"authenticated"}:{})},
          now:new Date().toISOString(),
          ...(req.headers["idempotency-key"]?{idempotencyKey:String(req.headers["idempotency-key"])}:{}),
          ...(payload?{payloadHash:createHash("sha256").update(payload).digest("hex")}:{})
        });
        if(!decision.allowed){
          json(res,decision.status,buildApiError({message:decision.code},correlationId),decision.retryAfterSeconds?{"retry-after":String(decision.retryAfterSeconds)}:{});
          return;
        }

        if(url.pathname==="/v1/auth/register"&&method==="POST"){
          if(!pool){json(res,503,buildApiError({message:"IDENTITY_DATABASE_UNAVAILABLE"},correlationId));return;}
          const input=safeJson(payload) as {loginIdentifier?:string;displayName?:string;password?:string}|null;
          if(!input?.loginIdentifier||!input.displayName||!input.password){json(res,400,buildApiError({message:"INVALID_AUTH_INPUT"},correlationId));return;}
          const result=await registerWithPassword(pool,{loginIdentifier:input.loginIdentifier,displayName:input.displayName,password:input.password});
          const data={userId:result.userId,csrfToken:result.session.csrfToken,expiresAt:result.session.expiresAt,...(nativeClient?{sessionToken:result.sessionToken}:{})};
          json(res,201,buildApiSuccess("v1",correlationId,data),{"set-cookie":buildSessionCookie(result.sessionToken,3600)});
          return;
        }

        if(url.pathname==="/v1/auth/login"&&method==="POST"){
          if(!pool){json(res,503,buildApiError({message:"IDENTITY_DATABASE_UNAVAILABLE"},correlationId));return;}
          const input=safeJson(payload) as {loginIdentifier?:string;password?:string}|null;
          if(!input?.loginIdentifier||!input.password){json(res,400,buildApiError({message:"INVALID_AUTH_INPUT"},correlationId));return;}
          const result=await loginWithPassword(pool,{loginIdentifier:input.loginIdentifier,password:input.password});
          const data={userId:result.userId,csrfToken:result.session.csrfToken,expiresAt:result.session.expiresAt,...(nativeClient?{sessionToken:result.sessionToken}:{})};
          json(res,200,buildApiSuccess("v1",correlationId,data),{"set-cookie":buildSessionCookie(result.sessionToken,3600)});
          return;
        }

        if(url.pathname==="/v1/auth/me"&&method==="GET"){
          if(!pool||!sessionToken){json(res,401,buildApiError({message:"SESSION_INVALID"},correlationId));return;}
          try{
            const session=await resolveSession(pool,sessionToken);
            const result=await pool.query("SELECT id,display_name FROM users WHERE id=$1 AND status='active'",[session.userId]);
            if(!result.rowCount){json(res,401,buildApiError({message:"SESSION_INVALID"},correlationId));return;}
            json(res,200,buildApiSuccess("v1",correlationId,{userId:String(result.rows[0].id),displayName:String(result.rows[0].display_name)}));
          }catch{json(res,401,buildApiError({message:"SESSION_INVALID"},correlationId));}
          return;
        }

        if(url.pathname==="/v1/auth/logout"&&method==="POST"){
          if(!pool||!sessionToken){json(res,401,buildApiError({message:"SESSION_INVALID"},correlationId));return;}
          try{
            const session=await resolveSession(pool,sessionToken);
            if(!nativeClient){
              const csrfHeader=String(req.headers["x-csrf-token"]??"");
              const stored=await pool.query("SELECT csrf_hash FROM identity_sessions WHERE id=$1 AND revoked_at IS NULL",[session.sessionId]);
              assertCsrf(origin,origin,csrfHeader,stored.rows[0]?.csrf_hash as string|undefined);
            }
            await logout(pool,sessionToken);
          }catch(error){
            const message=error instanceof Error?error.message:"SESSION_INVALID";
            json(res,/^CSRF_/.test(message)?403:401,buildApiError({message:/^CSRF_/.test(message)?message:"SESSION_INVALID"},correlationId));
            return;
          }
          json(res,200,buildApiSuccess("v1",correlationId,{loggedOut:true}),{"set-cookie":"__Host-tpay_session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict"});
          return;
        }

        if(url.pathname==="/v1/profile"&&method==="GET"){
          json(res,200,buildApiSuccess("v1",correlationId,{status:"sandbox",message:"Identity persistence is enabled behind the secure API boundary."}),{"strict-transport-security":"max-age=63072000; includeSubDomains"});
          return;
        }

        json(res,404,buildApiError({message:"API_ROUTE_NOT_FOUND"},correlationId));
      }catch(error){
        const message=error instanceof Error?error.message:"API_INTERNAL_ERROR";
        const status=/AUTHENTICATION_FAILED|SESSION_INVALID/.test(message)?401:/INVALID_|REGISTRATION_UNAVAILABLE/.test(message)?400:500;
        json(res,status,buildApiError({message:status===500?"API_INTERNAL_ERROR":message},correlationId));
      }
    }
  );
  server.on("close",()=>{void pool?.end();});
  return {server,port:input.port??0};
}
