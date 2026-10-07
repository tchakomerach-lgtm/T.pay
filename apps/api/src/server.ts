import { createHash, randomUUID } from "node:crypto";
import { evaluateRuntimeMode, resolveRuntimeMode, decodeCursor, encodeCursor } from "../../../packages/platform/src/index.js";
import { MetricsRegistry } from "../../../packages/observability/src/index.js";
import { createServer as createHttpsServer, type Server } from "node:https";
import { readFileSync } from "node:fs";
import { ApiAbuseRepository, type RateDb } from "../../../packages/api-gateway/src/rate-abuse.js";
import { ApiRuntimeGate } from "../../../packages/api-gateway/src/runtime-gate.js";
import { buildApiError, buildApiSuccess } from "../../../packages/api-gateway/src/api-contract.js";
import { ApiGatewayRepository, canonicalRequestHash } from "../../../packages/api-gateway/src/repository.js";
import { runHealthProbes } from "../../../packages/api-gateway/src/health.js";
import pg from "pg";
import { resolveAdminPrincipal, assertPrivilegedCandidate, getRuntimeControl, createRuntimeChangeRequest, approveRuntimeChange, listAdminAudit } from "../../../packages/security/src/admin-runtime.js";
import { createPersistedStepUpChallenge, completePersistedStepUp } from "../../../packages/security/src/webauthn-stepup.js";
import { assertCsrf, loginWithPassword, logout, registerWithPassword, resolveSession, buildSessionCookie, openOrganizationSession, listOrganizationMembers, createOrganizationRole, updateOrganizationRole, setOrganizationMemberRole, setOrganizationMemberStatus, getOrganization, updateOrganization, listOrganizationAudit, createOrganizationInvitation, acceptOrganizationInvitation, issueOrganizationPortalCode, openOrganizationPortalSession } from "../../../packages/identity/src/postgres.js";

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
function expectedWebOrigin():string{
  const value=process.env.TPAY_WEB_ORIGIN??"https://app.tpay.tg";
  if(!/^https:\/\/[^/]+$/.test(value))throw new Error("WEB_ORIGIN_INVALID");
  return value;
}
async function requireBrowserCsrf(pool:pg.Pool,session:{sessionId:string},origin:string,header:string|undefined):Promise<void>{
  const expected=expectedWebOrigin();
  const stored=await pool.query("SELECT csrf_hash FROM identity_sessions WHERE id=$1 AND revoked_at IS NULL",[session.sessionId]);
  assertCsrf(origin,expected,header,stored.rows[0]?.csrf_hash as string|undefined);
}
function cursorSecret():string{
  const value=process.env.TPAY_CURSOR_SECRET;
  if(value) return value;
  if(process.env.NODE_ENV==="production") throw new Error("CURSOR_SECRET_REQUIRED");
  return "tpay-development-cursor-secret-012345678901234567";
}
function safeJson(payload:string):Record<string,unknown>|null{
  try{const value=JSON.parse(payload);return value&&typeof value==="object"?value:null;}catch{return null;}
}

export function createApiServer(input:{tlsKey:string;tlsCert:string;port?:number;databaseUrl?:string}):{server:Server;port:number}{
  if(!input.tlsKey||!input.tlsCert)throw new Error("TLS_CERTIFICATE_REQUIRED");
  const databaseUrl=input.databaseUrl??process.env.TPAY_DATABASE_URL;
  const pool=databaseUrl?new pg.Pool({connectionString:databaseUrl,max:20}):undefined;
  const gate=new ApiRuntimeGate(pool?new ApiAbuseRepository(pool):new ApiAbuseRepository(new MemoryRateDb()));
  const requestGovernance=pool?new ApiGatewayRepository(pool):undefined;
  if(!pool && process.env.NODE_ENV==="production")throw new Error("RATE_LIMIT_DATABASE_REQUIRED");
  const metrics=new MetricsRegistry();
  const configuredRuntimeMode=resolveRuntimeMode();

  const server=createHttpsServer(
    {key:readFileSync(input.tlsKey),cert:readFileSync(input.tlsCert),minVersion:"TLSv1.3"},
    async(req,res)=>{
      const origin=String(req.headers.origin??"");
      const nativeClient=String(req.headers["x-tpay-client"]??"").toLowerCase()==="native";
      const bearer=/^Bearer\s+(.+)$/i.exec(String(req.headers.authorization??""))?.[1];
      const correlationId=String(req.headers["x-correlation-id"]??randomUUID());
      const method=req.method??"GET";
      const url=new URL(req.url??"/","https://tpay.local");
      const startedAt=process.hrtime.bigint();
      let requestRuntimeMode=configuredRuntimeMode;
      res.on("finish",()=>metrics.inc("tpay_http_requests_total",{route:url.pathname,method,status:String(res.statusCode),mode:requestRuntimeMode,channel:nativeClient?"native":"web"}));
      res.on("finish",()=>metrics.observe("tpay_http_request_duration_seconds",Number(process.hrtime.bigint()-startedAt)/1e9,{route:url.pathname,method,mode:requestRuntimeMode}));

      try{
        if(url.pathname==="/v1/health"&&method==="GET"){
          const probes=[
            {name:"api-server",check:async()=>true},
            {name:"api-runtime-gate",check:async()=>true},
            ...(pool?[{name:"postgres",check:async()=>{await pool.query("SELECT 1");return true;}}]:[])
          ];
          const report=await runHealthProbes(probes);
          const healthMode=pool ? (await getRuntimeControl(pool).catch(()=>({mode:configuredRuntimeMode} as {mode:typeof configuredRuntimeMode}))).mode : configuredRuntimeMode;
          json(res,report.ready?200:503,buildApiSuccess("v1",correlationId,{...report,mode:healthMode}),{"strict-transport-security":"max-age=63072000; includeSubDomains"});
          return;
        }

        if(url.pathname==="/v1/metrics"&&method==="GET"){
          const configured=process.env.TPAY_METRICS_TOKEN;
          if(!configured){json(res,404,buildApiError({message:"METRICS_NOT_EXPOSED"},correlationId));return;}
          const supplied=String(req.headers.authorization??"").replace(/^Bearer\s+/i,"");
          const a=createHash("sha256").update(supplied).digest("hex");
          const b=createHash("sha256").update(configured).digest("hex");
          if(a!==b){json(res,401,buildApiError({message:"METRICS_UNAUTHORIZED"},correlationId));return;}
          res.writeHead(200,{"content-type":"text/plain; version=0.0.4; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});
          res.end(metrics.toPrometheus());
          return;
        }

        const isAdminRoute=url.pathname.startsWith("/v1/admin/");
        requestRuntimeMode=pool ? (await getRuntimeControl(pool).catch(()=>({mode:configuredRuntimeMode} as {mode:typeof configuredRuntimeMode}))).mode : configuredRuntimeMode;
        const modeDecision=evaluateRuntimeMode(requestRuntimeMode,method,url.pathname);
        if(!isAdminRoute && !modeDecision.allowed){
          json(res,modeDecision.status,buildApiError({message:modeDecision.code},correlationId),modeDecision.retryAfterSeconds?{"retry-after":String(modeDecision.retryAfterSeconds)}:{});
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
        let authClass:"anonymous"|"user"|"member"|"admin"="anonymous";
        let authenticatedSession:{sessionId:string;userId:string;organizationId?:string;csrfToken:string;expiresAt:string;assurance:"standard"|"step_up"}|undefined;
        if(sessionToken&&pool){
          try{
            const session=await resolveSession(pool,sessionToken);
            authenticatedSession=session;
            userId=session.userId;
            authClass=session.organizationId?"member":"user";
            if(!session.organizationId){ try { await resolveAdminPrincipal(pool,session.userId,session.assurance); authClass="admin"; } catch {} }
          }catch{}
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

        let idempotencyRequestId:string|undefined;
        if(requestGovernance && method!=="GET" && method!=="HEAD" && req.headers["idempotency-key"]){
          const rawKey=String(req.headers["idempotency-key"]);
          const scopedKey=(userId??"anonymous")+":"+rawKey;
          const requestHash=canonicalRequestHash(method,url.pathname,payload);
          const replay=await requestGovernance.reserveOrReplay({
            ...(authenticatedSession?.organizationId ? {organizationId:authenticatedSession.organizationId} : {}),
            key:scopedKey,
            requestHash,
            route:url.pathname,
            expiresAt:new Date(Date.now()+24*60*60*1000).toISOString()
          });
          if(replay.status==="conflict"){
            json(res,409,buildApiError({message:"IDEMPOTENCY_KEY_CONFLICT"},correlationId));return;
          }
          if(replay.status==="replay"){
            if(replay.responseBody && replay.statusCode){
              res.writeHead(replay.statusCode,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-idempotent-replay":"true"});
              res.end(replay.responseBody);
              return;
            }
            json(res,409,buildApiError({message:"IDEMPOTENCY_IN_PROGRESS"},correlationId));return;
          }
          idempotencyRequestId=replay.requestId;
          const originalEnd=res.end.bind(res);
          const governanceId=idempotencyRequestId;
          (res as any).end=async(chunk?:any,encoding?:any,callback?:any)=>{
            const body=chunk===undefined?"":Buffer.isBuffer(chunk)?chunk.toString("utf8"):String(chunk);
            const responseHash=createHash("sha256").update(body).digest("hex");
            const state=res.statusCode>=200&&res.statusCode<500?"succeeded":"failed";
            try{await requestGovernance.completeIdempotency({requestId:governanceId,state,responseHash,responseBody:body,statusCode:res.statusCode||200});}
            finally{originalEnd(chunk,encoding,callback);}
          };
        }

        if(url.pathname==="/v1/admin/auth/webauthn/challenge"&&method==="POST"){
          if(!pool||!authenticatedSession||!userId){json(res,401,buildApiError({message:"SESSION_INVALID"},correlationId));return;}
          try{
            await requireBrowserCsrf(pool,authenticatedSession,origin,String(req.headers["x-csrf-token"]??""));
            await assertPrivilegedCandidate(pool,userId);
            const rpId=new URL(expectedWebOrigin()).hostname;
            const challenge=await createPersistedStepUpChallenge(pool,{userId,rpId,origin:expectedWebOrigin()});
            json(res,201,buildApiSuccess("v1",correlationId,{challengeId:challenge.id,challenge:challenge.challenge,rpId:challenge.rpId,origin:challenge.origin,expiresAt:challenge.expiresAt}));return;
          }catch(error){json(res,403,buildApiError({message:error instanceof Error?error.message:"WEBAUTHN_CHALLENGE_DENIED"},correlationId));return;}
        }
        if(url.pathname==="/v1/admin/auth/webauthn/step-up"&&method==="POST"){
          if(!pool||!authenticatedSession||!userId){json(res,401,buildApiError({message:"SESSION_INVALID"},correlationId));return;}
          try{
            await requireBrowserCsrf(pool,authenticatedSession,origin,String(req.headers["x-csrf-token"]??""));
            const input=safeJson(payload) as any;
            if(!input?.challengeId||!input?.credentialId||!input?.clientDataJSON||!input?.authenticatorData||!input?.signature)throw new Error("WEBAUTHN_INPUT_INVALID");
            const decode=(v:string)=>Buffer.from(v,"base64url");
            const result=await completePersistedStepUp(pool,{sessionId:authenticatedSession.sessionId,userId,challengeId:String(input.challengeId),credentialId:String(input.credentialId),clientDataJSON:decode(String(input.clientDataJSON)),authenticatorData:decode(String(input.authenticatorData)),signature:decode(String(input.signature)),publicKeyDer:Buffer.alloc(0),algorithm:"ES256",requireUserVerification:true});
            json(res,200,buildApiSuccess("v1",correlationId,{assurance:"step_up",signCount:result.signCount,userVerified:result.userVerified}));return;
          }catch(error){json(res,403,buildApiError({message:error instanceof Error?error.message:"WEBAUTHN_STEP_UP_DENIED"},correlationId));return;}
        }

        if(url.pathname==="/v1/admin/overview"&&method==="GET"){
          if(!pool||!authenticatedSession||authClass!=="admin"){json(res,403,buildApiError({message:"ADMIN_ACCESS_DENIED"},correlationId));return;}
          const runtime=await getRuntimeControl(pool);
          const privileged=await pool.query("SELECT privileged_level,assurance,expires_at FROM tpay_privileged_identities WHERE human_user_id=$1 AND active=true AND expires_at>now() ORDER BY privileged_level DESC",[userId]);
          const pending=await pool.query("SELECT count(*)::int AS count FROM tpay_runtime_change_requests WHERE status='PENDING' AND expires_at>now()");
          json(res,200,buildApiSuccess("v1",correlationId,{runtime,privileged:privileged.rows.map(x=>({level:String(x.privileged_level),assurance:String(x.assurance),expiresAt:new Date(x.expires_at).toISOString()})),pendingRequests:Number(pending.rows[0]?.count??0)}));return;
        }
        if(url.pathname==="/v1/admin/runtime"&&method==="GET"){
          if(!pool||!authenticatedSession||authClass!=="admin"){json(res,403,buildApiError({message:"ADMIN_ACCESS_DENIED"},correlationId));return;}
          json(res,200,buildApiSuccess("v1",correlationId,await getRuntimeControl(pool)));return;
        }
        if(url.pathname==="/v1/admin/runtime/change-requests"&&method==="POST"){
          if(!pool||!authenticatedSession||authClass!=="admin"){json(res,403,buildApiError({message:"ADMIN_ACCESS_DENIED"},correlationId));return;}
          try{
            await requireBrowserCsrf(pool,authenticatedSession,origin,String(req.headers["x-csrf-token"]??""));
            const input=safeJson(payload) as {mode?:string;reason?:string}|null;
            const mode=input?.mode as any;
            if(!["normal","degraded","readonly","maintenance"].includes(mode)||!input?.reason)throw new Error("RUNTIME_INPUT_INVALID");
            const actor=await resolveAdminPrincipal(pool,userId!,authenticatedSession.assurance);
            const result=await createRuntimeChangeRequest(pool,{actor,mode,reason:input.reason,expiresAt:new Date(Date.now()+10*60*1000)});
            json(res,201,buildApiSuccess("v1",correlationId,result));return;
          }catch(error){json(res,403,buildApiError({message:error instanceof Error?error.message:"ADMIN_RUNTIME_DENIED"},correlationId));return;}
        }
        if(url.pathname.startsWith("/v1/admin/runtime/change-requests/")&&url.pathname.endsWith("/approve")&&method==="POST"){
          if(!pool||!authenticatedSession||authClass!=="admin"){json(res,403,buildApiError({message:"ADMIN_ACCESS_DENIED"},correlationId));return;}
          try{
            await requireBrowserCsrf(pool,authenticatedSession,origin,String(req.headers["x-csrf-token"]??""));
            const requestId=url.pathname.split("/")[5] ?? "";
            const actor=await resolveAdminPrincipal(pool,userId!,authenticatedSession.assurance);
            const result=await approveRuntimeChange(pool,{actor,requestId});
            json(res,200,buildApiSuccess("v1",correlationId,result));return;
          }catch(error){json(res,403,buildApiError({message:error instanceof Error?error.message:"ADMIN_APPROVAL_DENIED"},correlationId));return;}
        }
        if(url.pathname==="/v1/admin/audit"&&method==="GET"){
          if(!pool||!authenticatedSession||authClass!=="admin"){json(res,403,buildApiError({message:"ADMIN_ACCESS_DENIED"},correlationId));return;}
          const limit=Math.min(Number(url.searchParams.get("limit")??25)||25,100);
          const cursor=url.searchParams.get("cursor")??undefined;
          json(res,200,buildApiSuccess("v1",correlationId,await listAdminAudit(pool,cursor===undefined?{limit}:{limit,cursor})));return;
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

        if(url.pathname==="/v1/organizations"&&method==="GET"){
          if(!pool||!sessionToken||!userId){json(res,401,buildApiError({message:"SESSION_INVALID"},correlationId));return;}
          const rawCursor=url.searchParams.get("cursor");
          let cursorCreatedAt:string|undefined;
          let cursorId:string|undefined;
          if(rawCursor){
            try{
              const decoded=decodeCursor(rawCursor,cursorSecret(),"orgs:"+userId);
              cursorCreatedAt=decoded.createdAt; cursorId=decoded.id;
            }catch{json(res,400,buildApiError({message:"INVALID_CURSOR"},correlationId));return;}
          }
          const requestedLimit=Number(url.searchParams.get("limit")??"25");
          if(!Number.isInteger(requestedLimit)||requestedLimit<1||requestedLimit>50){json(res,400,buildApiError({message:"INVALID_PAGE_LIMIT"},correlationId));return;}
          const limit=requestedLimit;
          const result=await pool.query(
            `SELECT o.id,o.name,o.type,o.status,o.created_at,m.role_id,r.name AS role_name,m.status AS membership_status
               FROM organization_memberships m
               JOIN organizations o ON o.id=m.organization_id
               JOIN organization_roles r ON r.id=m.role_id
              WHERE m.user_id=$1 AND m.status='active' AND o.status='active'
                AND ($2::timestamptz IS NULL OR (o.created_at,o.id)<($2::timestamptz,$3::uuid))
              ORDER BY o.created_at DESC,o.id DESC LIMIT $4`,
            [userId,cursorCreatedAt??null,cursorId??null,limit]);
          const items=result.rows.map(row=>({
            id:String(row.id),name:String(row.name),type:String(row.type),status:String(row.status),
            roleId:String(row.role_id),roleName:String(row.role_name),membershipStatus:String(row.membership_status)
          }));
          const last=result.rows.at(-1);
          const nextCursor=result.rows.length===limit&&last?encodeCursor({createdAt:new Date(String(last.created_at)).toISOString(),id:String(last.id),scope:"orgs:"+userId},cursorSecret()):null;
          json(res,200,buildApiSuccess("v1",correlationId,{items,nextCursor}));
          return;
        }

        if(url.pathname==="/v1/organizations"&&method==="POST"){
          if(!pool||!sessionToken||!userId){json(res,401,buildApiError({message:"SESSION_INVALID"},correlationId));return;}
          if(!nativeClient)await requireBrowserCsrf(pool,{sessionId:(await resolveSession(pool,sessionToken)).sessionId},origin,String(req.headers["x-csrf-token"]??""));
          const input=safeJson(payload) as {name?:string;type?:string;accessCode?:string}|null;
          if(!input?.name||!input.type||!input.accessCode){json(res,400,buildApiError({message:"INVALID_ORGANIZATION_INPUT"},correlationId));return;}
          const name=input.name; const type=input.type; const accessCode=input.accessCode;
          const created=await import("../../../packages/identity/src/postgres.js").then(m=>m.createOrganizationWithFounder(pool,{founderId:userId,name,type,accessCode}));
          json(res,201,buildApiSuccess("v1",correlationId,created));
          return;
        }

        if(/^\/v1\/organizations\/[^/]+\/session$/.test(url.pathname)&&method==="POST"){
          if(!pool||!sessionToken||!userId){json(res,401,buildApiError({message:"SESSION_INVALID"},correlationId));return;}
          const organizationId=url.pathname.split("/")[3]!;
          const input=safeJson(payload) as {accessCode?:string}|null;
          if(!input?.accessCode){json(res,400,buildApiError({message:"INVALID_ORGANIZATION_ACCESS_CODE"},correlationId));return;}
          if(!nativeClient){
            const csrfHeader=String(req.headers["x-csrf-token"]??"");
            await requireBrowserCsrf(pool,{sessionId:authenticatedSession?.sessionId??""},origin,csrfHeader);
          }
          const session=await openOrganizationSession(pool,{sessionToken,organizationId,accessCode:input.accessCode});
          json(res,200,buildApiSuccess("v1",correlationId,{organizationId,expiresAt:session.expiresAt}));
          return;
        }

        const orgItemMatch=url.pathname.match(/^\/v1\/organizations\/([^/]+)$/);
        if(pool&&userId&&orgItemMatch&&method==="GET"){
          const organizationId=orgItemMatch[1]!;
          if(authenticatedSession?.organizationId!==organizationId){json(res,403,buildApiError({message:"ORGANIZATION_SESSION_REQUIRED"},correlationId));return;}
          try{json(res,200,buildApiSuccess("v1",correlationId,await getOrganization(pool,{organizationId,actorUserId:userId})));}
          catch(error){json(res,403,buildApiError(error,correlationId));}
          return;
        }
        if(pool&&userId&&orgItemMatch&&method==="PATCH"){
          const organizationId=orgItemMatch[1]!;
          if(authenticatedSession?.organizationId!==organizationId){json(res,403,buildApiError({message:"ORGANIZATION_SESSION_REQUIRED"},correlationId));return;}
          if(!nativeClient)await requireBrowserCsrf(pool,{sessionId:authenticatedSession?.sessionId??""},origin,String(req.headers["x-csrf-token"]??""));
          const input=safeJson(payload) as {name?:string;type?:string;status?:"active"|"suspended"|"closed"}|null;
          if(!input || (input.name===undefined&&input.type===undefined&&input.status===undefined)){json(res,400,buildApiError({message:"INVALID_ORGANIZATION_UPDATE"},correlationId));return;}
          try{
            const updateInput:{organizationId:string;actorUserId:string;name?:string;type?:string;status?:"active"|"suspended"|"closed"}={organizationId,actorUserId:userId,...(input.name!==undefined?{name:input.name}:{}),...(input.type!==undefined?{type:input.type}:{}),...(input.status!==undefined?{status:input.status}: {})};
            json(res,200,buildApiSuccess("v1",correlationId,await updateOrganization(pool,updateInput)));
          }
          catch(error){const message=error instanceof Error?error.message:"ORGANIZATION_UPDATE_FAILED";const status=message==="PERMISSION_DENIED"?403:/^INVALID_/.test(message)?400:404;json(res,status,buildApiError({message},correlationId));}
          return;
        }
        const orgAuditMatch=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/audit$/);
        if(pool&&userId&&orgAuditMatch&&method==="GET"){
          const organizationId=orgAuditMatch[1]!;
          if(authenticatedSession?.organizationId!==organizationId){json(res,403,buildApiError({message:"ORGANIZATION_SESSION_REQUIRED"},correlationId));return;}
          try{json(res,200,buildApiSuccess("v1",correlationId,{items:await listOrganizationAudit(pool,{organizationId,actorUserId:userId,limit:Number(url.searchParams.get("limit")??"50")})}));}
          catch(error){json(res,403,buildApiError(error,correlationId));}
          return;
        }

        const orgInvitationMatch=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/invitations$/);
        if(pool&&userId&&orgInvitationMatch&&method==="POST"){
          const organizationId=orgInvitationMatch[1]!;
          if(authenticatedSession?.organizationId!==organizationId){json(res,403,buildApiError({message:"ORGANIZATION_SESSION_REQUIRED"},correlationId));return;}
          if(!nativeClient)await requireBrowserCsrf(pool,{sessionId:authenticatedSession?.sessionId??""},origin,String(req.headers["x-csrf-token"]??""));
          const input=safeJson(payload) as {loginIdentifier?:string;roleId?:string;expiresInHours?:number}|null;
          if(!input?.loginIdentifier||!input.roleId){json(res,400,buildApiError({message:"INVALID_INVITATION"},correlationId));return;}
          try{json(res,201,buildApiSuccess("v1",correlationId,await createOrganizationInvitation(pool,{organizationId,actorUserId:userId,loginIdentifier:input.loginIdentifier,roleId:input.roleId,...(input.expiresInHours!==undefined ? {expiresInHours:input.expiresInHours} : {})})));}
          catch(error){const message=error instanceof Error?error.message:"INVITATION_FAILED";json(res,/PERMISSION_DENIED|MEMBER_ALREADY_ACTIVE/.test(message)?403:400,buildApiError({message},correlationId));}
          return;
        }
        const orgInvitationAcceptMatch=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/invitations\/([^/]+)\/accept$/);
        if(pool&&userId&&orgInvitationAcceptMatch&&method==="POST"){
          const organizationId=orgInvitationAcceptMatch[1]!,invitationId=orgInvitationAcceptMatch[2]!;
          if(!nativeClient)await requireBrowserCsrf(pool,{sessionId:authenticatedSession?.sessionId??""},origin,String(req.headers["x-csrf-token"]??""));
          const input=safeJson(payload) as {token?:string}|null;
          if(!input?.token){json(res,400,buildApiError({message:"INVALID_INVITATION"},correlationId));return;}
          try{await acceptOrganizationInvitation(pool,{organizationId,invitationId,token:input.token,userId});json(res,200,buildApiSuccess("v1",correlationId,{accepted:true}));}
          catch(error){json(res,400,buildApiError(error,correlationId));}
          return;
        }
        const orgPortalCodeMatch=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/portal-codes$/);
        if(pool&&userId&&orgPortalCodeMatch&&method==="POST"){
          const organizationId=orgPortalCodeMatch[1]!;
          if(authenticatedSession?.organizationId!==organizationId){json(res,403,buildApiError({message:"ORGANIZATION_SESSION_REQUIRED"},correlationId));return;}
          if(!nativeClient)await requireBrowserCsrf(pool,{sessionId:authenticatedSession?.sessionId??""},origin,String(req.headers["x-csrf-token"]??""));
          const input=safeJson(payload) as {userId?:string;expiresInHours?:number}|null;
          if(!input?.userId){json(res,400,buildApiError({message:"INVALID_PORTAL_CODE"},correlationId));return;}
          try{json(res,201,buildApiSuccess("v1",correlationId,await issueOrganizationPortalCode(pool,{organizationId,actorUserId:userId,userId:input.userId,...(input.expiresInHours!==undefined ? {expiresInHours:input.expiresInHours} : {})})));}
          catch(error){const message=error instanceof Error?error.message:"PORTAL_CODE_FAILED";json(res,/PERMISSION_DENIED/.test(message)?403:400,buildApiError({message},correlationId));}
          return;
        }
        const orgPortalSessionMatch=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/portal-session$/);
        if(pool&&userId&&orgPortalSessionMatch&&method==="POST"){
          const organizationId=orgPortalSessionMatch[1]!;
          if(!nativeClient)await requireBrowserCsrf(pool,{sessionId:authenticatedSession?.sessionId??""},origin,String(req.headers["x-csrf-token"]??""));
          const input=safeJson(payload) as {portalCode?:string}|null;
          if(!input?.portalCode){json(res,400,buildApiError({message:"INVALID_PORTAL_CODE"},correlationId));return;}
          try{const session=await openOrganizationPortalSession(pool,{sessionToken:sessionToken!,organizationId,portalCode:input.portalCode});json(res,200,buildApiSuccess("v1",correlationId,{organizationId,expiresAt:session.expiresAt}));}
          catch(error){json(res,403,buildApiError(error,correlationId));}
          return;
        }

        const orgMemberMatch=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/members$/);
        const orgRoleMatch=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/roles$/);
        const orgRoleItemMatch=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/roles\/([^/]+)$/);
        const orgMemberItemMatch=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/members\/([^/]+)$/);
        if(pool&&userId&&orgMemberMatch&&method==="GET"){
          const organizationId=orgMemberMatch[1]!;
          if(authenticatedSession?.organizationId!==organizationId){json(res,403,buildApiError({message:"ORGANIZATION_SESSION_REQUIRED"},correlationId));return;}
          try{const items=await listOrganizationMembers(pool,organizationId,userId);json(res,200,buildApiSuccess("v1",correlationId,{items,nextCursor:null}));}
          catch(error){json(res,403,buildApiError(error,correlationId));}
          return;
        }
        if(pool&&userId&&orgRoleMatch&&method==="POST"){
          const organizationId=orgRoleMatch[1]!;
          if(authenticatedSession?.organizationId!==organizationId){json(res,403,buildApiError({message:"ORGANIZATION_SESSION_REQUIRED"},correlationId));return;}
          if(!nativeClient)await requireBrowserCsrf(pool,{sessionId:authenticatedSession?.sessionId??""},origin,String(req.headers["x-csrf-token"]??""));
          const input=safeJson(payload) as {name?:string;permissions?:string[]}|null;
          if(!input?.name||!Array.isArray(input.permissions)){json(res,400,buildApiError({message:"INVALID_ROLE"},correlationId));return;}
          try{const result=await createOrganizationRole(pool,{organizationId,actorUserId:userId,name:input.name,permissions:input.permissions});json(res,201,buildApiSuccess("v1",correlationId,result));}
          catch(error){json(res,403,buildApiError(error,correlationId));}
          return;
        }
        if(pool&&userId&&orgRoleItemMatch&&method==="PATCH"){
          const organizationId=orgRoleItemMatch[1]!,roleId=orgRoleItemMatch[2]!;
          if(authenticatedSession?.organizationId!==organizationId){json(res,403,buildApiError({message:"ORGANIZATION_SESSION_REQUIRED"},correlationId));return;}
          if(!nativeClient)await requireBrowserCsrf(pool,{sessionId:authenticatedSession?.sessionId??""},origin,String(req.headers["x-csrf-token"]??""));
          const input=safeJson(payload) as {name?:string;permissions?:string[]}|null;
          if(!input?.name||!Array.isArray(input.permissions)){json(res,400,buildApiError({message:"INVALID_ROLE"},correlationId));return;}
          try{await updateOrganizationRole(pool,{organizationId,actorUserId:userId,roleId,name:input.name,permissions:input.permissions});json(res,200,buildApiSuccess("v1",correlationId,{updated:true}));}
          catch(error){json(res,403,buildApiError(error,correlationId));}
          return;
        }
        if(pool&&userId&&orgMemberItemMatch&&method==="PATCH"){
          const organizationId=orgMemberItemMatch[1]!,targetUserId=orgMemberItemMatch[2]!;
          if(authenticatedSession?.organizationId!==organizationId){json(res,403,buildApiError({message:"ORGANIZATION_SESSION_REQUIRED"},correlationId));return;}
          if(!nativeClient)await requireBrowserCsrf(pool,{sessionId:authenticatedSession?.sessionId??""},origin,String(req.headers["x-csrf-token"]??""));
          const input=safeJson(payload) as {roleId?:string;status?:"active"|"suspended"|"revoked"}|null;
          if(!input?.roleId&&!input?.status){json(res,400,buildApiError({message:"INVALID_MEMBER_UPDATE"},correlationId));return;}
          try{
            if(input.roleId)await setOrganizationMemberRole(pool,{organizationId,actorUserId:userId,userId:targetUserId,roleId:input.roleId});
            if(input.status)await setOrganizationMemberStatus(pool,{organizationId,actorUserId:userId,userId:targetUserId,status:input.status});
            json(res,200,buildApiSuccess("v1",correlationId,{updated:true}));
          }catch(error){json(res,403,buildApiError(error,correlationId));}
          return;
        }

        if(url.pathname==="/v1/client/telemetry"&&method==="POST"){
          if(!pool||!sessionToken||!userId){json(res,401,buildApiError({message:"SESSION_INVALID"},correlationId));return;}
          const input=safeJson(payload) as {events?:unknown[]}|null;
          if(!input||!Array.isArray(input.events)||input.events.length>50){json(res,400,buildApiError({message:"INVALID_TELEMETRY_BATCH"},correlationId));return;}
          console.info(JSON.stringify({event:"tpay.client.telemetry",correlationId,userId,count:input.events.length,events:input.events}));
          json(res,202,buildApiSuccess("v1",correlationId,{accepted:input.events.length}));
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
