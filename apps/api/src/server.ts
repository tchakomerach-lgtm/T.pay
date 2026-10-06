import { createHash, randomUUID } from "node:crypto";
import { createServer as createHttpsServer, type Server } from "node:https";
import { readFileSync } from "node:fs";
import { ApiAbuseRepository, type RateDb } from "../../../packages/api-gateway/src/rate-abuse.js";
import { ApiRuntimeGate } from "../../../packages/api-gateway/src/runtime-gate.js";
import { buildApiError, buildApiSuccess } from "../../../packages/api-gateway/src/api-contract.js";
import { runHealthProbes } from "../../../packages/api-gateway/src/health.js";
import pg from "pg";
import { loginWithPassword, logout, registerWithPassword, resolveSession, buildSessionCookie } from "../../../packages/identity/src/postgres.js";

class MemoryRateDb implements RateDb {
  private readonly buckets = new Map<string,{count:number;windowStartedAt:string;max:number;seconds:number}>();
  async query(sql:string, values:unknown[]=[]):Promise<{rows:Record<string,unknown>[];rowCount:number}> {
    if(sql.includes("api_rate_limit_buckets")){
      const valuesTyped=values as [string,string,string,number,number,string];
      const key=valuesTyped[0]+"|"+valuesTyped[1];
      const existing=this.buckets.get(key);
      const next=!existing || existing.windowStartedAt < valuesTyped[2]
        ? {count:1,windowStartedAt:valuesTyped[2],max:valuesTyped[3],seconds:valuesTyped[4]}
        : {...existing,count:existing.count+1,max:valuesTyped[3],seconds:valuesTyped[4]};
      this.buckets.set(key,next);
      return {rows:[{request_count:next.count,max_requests:next.max,window_started_at:next.windowStartedAt,window_seconds:next.seconds}],rowCount:1};
    }
    return {rows:[],rowCount:0};
  }
}

function parseCookies(value:string|undefined):Record<string,string>{const out:Record<string,string>={};for(const item of (value??"").split(";")){const i=item.indexOf("=");if(i>0)out[item.slice(0,i).trim()]=decodeURIComponent(item.slice(i+1).trim());}return out;}
function json(res:import("node:http").ServerResponse,status:number,body:unknown,extra:Record<string,string>={}){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","x-frame-options":"DENY","referrer-policy":"no-referrer","cross-origin-opener-policy":"same-origin","cross-origin-resource-policy":"same-origin","content-security-policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",...extra});
  res.end(JSON.stringify(body));
}

export function createApiServer(input:{tlsKey:string;tlsCert:string;port?:number;databaseUrl?:string}):{server:Server;port:number}{
  if(!input.tlsKey||!input.tlsCert) throw new Error("TLS_CERTIFICATE_REQUIRED");
  const databaseUrl=input.databaseUrl??process.env.TPAY_DATABASE_URL;
  const pool=databaseUrl?new pg.Pool({connectionString:databaseUrl,max:20}):undefined;
  const gate=new ApiRuntimeGate(new ApiAbuseRepository(new MemoryRateDb()));
  const server=createHttpsServer({key:readFileSync(input.tlsKey),cert:readFileSync(input.tlsCert),minVersion:"TLSv1.3"},async(req,res)=>{
    const origin=String(req.headers.origin??"");
    const correlationId=String(req.headers["x-correlation-id"]??randomUUID());
    const method=req.method??"GET";
    const url=new URL(req.url??"/","https://tpay.local");
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
    for await(const chunk of req){payload+=chunk.toString();if(Buffer.byteLength(payload)>64*1024){json(res,413,{status:413,code:"PAYLOAD_TOO_LARGE",correlationId});return;}}
    const cookies=parseCookies(req.headers.cookie);
    const sessionToken=cookies["__Host-tpay_session"];
    let userId:string|undefined;
    let authClass:"anonymous"|"user"="anonymous";
    if(sessionToken&&pool){try{const session=await resolveSession(pool,sessionToken);userId=session.userId;authClass="user";}catch{authClass="anonymous";}}
    const actorSecret=String(req.headers["x-tpay-scope"]??"");
    const decision=await gate.evaluate({method,route:url.pathname,authClass,channel:"web",origin,correlationId,scopeSecrets:{ip:String(req.socket.remoteAddress??"unknown"),channel:"web",...(authClass==="user"?{actor:userId??actorSecret||"authenticated"}:{})},now:new Date().toISOString(),...(req.headers["idempotency-key"]?{idempotencyKey:String(req.headers["idempotency-key"])}:{}),...(payload?{payloadHash:createHash("sha256").update(payload).digest("hex")}:{})});
    if(!decision.allowed){json(res,decision.status,buildApiError({message:decision.code},correlationId),decision.retryAfterSeconds?{"retry-after":String(decision.retryAfterSeconds)}:{});return;}
    if(url.pathname==="/v1/auth/register"&&method==="POST"){
      if(!pool){json(res,503,buildApiError({message:"IDENTITY_DATABASE_UNAVAILABLE"},correlationId));return;}
      const input=JSON.parse(payload) as {loginIdentifier:string;displayName:string;password:string};
      const result=await registerWithPassword(pool,input);
      json(res,201,buildApiSuccess("v1",correlationId,{userId:result.userId,csrfToken:result.session.csrfToken,expiresAt:result.session.expiresAt}),{"set-cookie":buildSessionCookie(result.sessionToken,3600)});
      return;
    }
    if(url.pathname==="/v1/auth/login"&&method==="POST"){
      if(!pool){json(res,503,buildApiError({message:"IDENTITY_DATABASE_UNAVAILABLE"},correlationId));return;}
      const input=JSON.parse(payload) as {loginIdentifier:string;password:string};
      const result=await loginWithPassword(pool,input);
      json(res,200,buildApiSuccess("v1",correlationId,{userId:result.userId,csrfToken:result.session.csrfToken,expiresAt:result.session.expiresAt}),{"set-cookie":buildSessionCookie(result.sessionToken,3600)});
      return;
    }
    if(url.pathname==="/v1/auth/me"&&method==="GET"){
      if(!pool||!sessionToken)throw new Error("SESSION_INVALID");
      const session=await resolveSession(pool,sessionToken);
      const result=await pool.query("SELECT id,display_name FROM users WHERE id=$1 AND status='active'",[session.userId]);
      if(!result.rowCount)throw new Error("SESSION_INVALID");
      json(res,200,buildApiSuccess("v1",correlationId,{userId:String(result.rows[0].id),displayName:String(result.rows[0].display_name)}));
      return;
    }
    if(url.pathname==="/v1/auth/logout"&&method==="POST"){
      if(pool&&sessionToken)await logout(pool,sessionToken);
      json(res,200,buildApiSuccess("v1",correlationId,{loggedOut:true}),{"set-cookie":"__Host-tpay_session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict"});
      return;
    }
    if(url.pathname==="/v1/profile"&&method==="GET"){
      json(res,200,buildApiSuccess("v1",correlationId,{status:"sandbox",message:"Identity persistence is not enabled in Web Alpha."}),{"strict-transport-security":"max-age=63072000; includeSubDomains"});
      return;
    }
    json(res,404,buildApiError({message:"API_ROUTE_NOT_FOUND"},correlationId));
  });
  return {server,port:input.port??0};
}
