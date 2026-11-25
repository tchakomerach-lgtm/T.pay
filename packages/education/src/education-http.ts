import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { assertAuthorized } from "../../security/src/authorization.js";
import type { Principal, Permission } from "../../security/src/policy.js";
import { assertSessionActive, assertSessionOrganization, type OrganizationSession } from "../../security/src/session.js";
import { authorizeRoute } from "../../api-gateway/src/policy.js";
import { buildApiError, buildApiSuccess } from "../../api-gateway/src/api-contract.js";
import { canonicalRequestHash, newCorrelationId, ApiGatewayRepository, type ApiDb } from "../../api-gateway/src/repository.js";
import { PostgresEducationSyncStore } from "./postgres-sync-fabric.js";
import { computeSyncPayloadHash } from "./sync-fabric.js";
import { SchoolRealtimeHub, toSseMessage, type SchoolRealtimeEvent } from "./school-realtime.js";
import { PostgresSchoolRealtimeStore } from "./postgres-realtime-store.js";
import type { SchoolRealtimeMessage } from "./school-realtime.js";
import { reconcileAttendance, claimWorkItem, resolveWorkItem, type AttendanceRecord, type WorkItem } from "./school-operations.js";
import { assignService, transitionService, type ActorRef, type ServiceRequest } from "./actor-services.js";

export interface SchoolAuthContext { principal: Principal; session: OrganizationSession; tenantId: string; }
export interface SchoolApiDependencies {
  db: ApiDb & { query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[];rowCount:number|null}> };
  authenticate(request: IncomingMessage): Promise<SchoolAuthContext>;
  syncClient(): ConstructorParameters<typeof PostgresEducationSyncStore>[0] | Promise<ConstructorParameters<typeof PostgresEducationSyncStore>[0]>;
  now?: () => Date;
  realtime?: SchoolRealtimeHub;
  realtimeStore?: Pick<PostgresSchoolRealtimeStore,"replay"|"append">;
  corsOrigins?: readonly string[];
}
const CORRELATION_ID=/^[A-Za-z0-9._:-]{1,128}$/;
const IDEMPOTENCY_KEY=/^[A-Za-z0-9._:-]{12,128}$/;
const MAX_URL_LENGTH=2048;
const MAX_HEADER_VALUE_LENGTH=4096;
const MAX_BODY_BYTES=1024*1024;
const setSecurityHeaders=(res:ServerResponse)=>{
  res.setHeader("x-content-type-options","nosniff");
  res.setHeader("referrer-policy","no-referrer");
  res.setHeader("permissions-policy","camera=(), microphone=(), geolocation=()");
  res.setHeader("x-frame-options","DENY");
  res.setHeader("cross-origin-resource-policy","same-origin");
  res.setHeader("cross-origin-opener-policy","same-origin");
  res.setHeader("x-permitted-cross-domain-policies","none");
  res.setHeader("strict-transport-security","max-age=31536000; includeSubDomains");
};
const json=(res:ServerResponse,status:number,body:unknown,correlationId:string)=>{
  if(res.headersSent||res.writableEnded)return false;
  const data=JSON.stringify(body);
  res.statusCode=status;
  res.setHeader("content-type","application/json; charset=utf-8");
  res.setHeader("x-correlation-id",correlationId);
  res.setHeader("cache-control","no-store");
  res.setHeader("pragma","no-cache");
  res.setHeader("x-content-type-options","nosniff");
  res.setHeader("referrer-policy","no-referrer");
  res.setHeader("permissions-policy","camera=(), microphone=(), geolocation=()");
  res.setHeader("x-frame-options","DENY");
  res.setHeader("cross-origin-resource-policy","same-origin");
  res.setHeader("cross-origin-opener-policy","same-origin");
  res.setHeader("x-permitted-cross-domain-policies","none");
  res.setHeader("strict-transport-security","max-age=31536000; includeSubDomains");
  res.setHeader("connection","close");
  res.end(data);
  return true;
};
async function readBody(req:IncomingMessage):Promise<string>{
  const declaredLength=String(req.headers["content-length"]??"").trim();
  if(declaredLength){
    if(!/^\d+$/.test(declaredLength))throw new Error("CONTENT_LENGTH_INVALID");
    if(Number(declaredLength)>MAX_BODY_BYTES)throw new Error("PAYLOAD_TOO_LARGE");
  }
  let out="",size=0;
  for await(const chunk of req){
    size+=Buffer.byteLength(chunk as string);
    if(size>MAX_BODY_BYTES)throw new Error("PAYLOAD_TOO_LARGE");
    out+=chunk;
  }
  return out;
}
const parse=(s:string)=>s?JSON.parse(s):{};
function route(path:string){
 const parts=path.split("/").filter(Boolean);
 if(parts[0]!=="v1")return null;
 if(parts[1]==="tontine"&&parts[2]==="groups"){
   if(parts.length===3)return ["tontine-groups"] as const;
   if(parts.length===5&&parts[3]&&parts[4]==="commission-policies")return ["tontine-commission",parts[3]] as const;
   if(parts.length===5&&parts[3]&&parts[4]==="roles")return ["tontine-role",parts[3]] as const;
   if(parts.length===5&&parts[3]&&parts[4]==="promotions")return ["tontine-promotion",parts[3]] as const;
   if(parts.length===5&&parts[3]&&parts[4]==="protection-policies")return ["tontine-protection",parts[3]] as const;
 }
 if(parts[1]!=="education")return null;
 if(parts[2]==="actors"&&parts.length===4&&parts[3])return ["actor",parts[3]] as const;
 if(parts[2]==="sync"&&parts[3]==="events"&&parts.length===4)return ["sync"] as const;
 if(parts[2]==="attendance"&&parts.length===3)return ["attendance"] as const;
 if(parts[2]==="work-items"&&parts.length===3)return ["work-create"] as const;
 if(parts[2]==="work-items"&&parts.length===5&&parts[3]&&(parts[4]==="claim"||parts[4]==="resolve"))return ["work",parts[3],parts[4]] as const;
 if(parts[2]==="service-requests"&&parts.length===3)return ["service-create"] as const;
 if(parts[2]==="service-requests"&&parts.length===5&&parts[3]&&parts[4]==="transition")return ["service-transition",parts[3]] as const;
 if(parts[2]==="events"&&parts[3]==="stream"&&parts.length===4)return ["stream"] as const;
 return null;
}
function permissionFor(kind:string,method="POST"):Permission{
 if(kind==="actor")return "org.read";
 if(kind==="tontine-groups"&&method==="GET")return "community.tontine.read";
 if(kind.startsWith("tontine-"))return "community.groups.manage";
 return "member.manage";
}
export interface SchoolApiServerOptions { serverFactory?: (handler:(req:IncomingMessage,res:ServerResponse)=>void) => Server; }

export function createSchoolApiServer(deps:SchoolApiDependencies, options:SchoolApiServerOptions={}){
 const serverFactory=options.serverFactory??((handler)=>(createServer(handler)));
 return serverFactory(async(req,res)=>{
  const correlationId=String(req.headers["x-correlation-id"]??newCorrelationId());
  try{
   if(!CORRELATION_ID.test(correlationId))throw new Error("API_CORRELATION_ID_INVALID");
   setSecurityHeaders(res);
   const rawUrl=String(req.url??"/");
   if(rawUrl.length>MAX_URL_LENGTH)throw new Error("API_URL_TOO_LONG");
   for(const [name,value] of Object.entries(req.headers)){
     const values=Array.isArray(value)?value:value===undefined?[]:[value];
     for(const item of values)if(String(item).length>MAX_HEADER_VALUE_LENGTH)throw new Error("API_HEADER_TOO_LARGE:"+name);
   }
   const method=(req.method??"GET").toUpperCase(), path=(rawUrl.split("?")[0]??"/"), r=route(path);
   const origin=String(req.headers.origin??"").trim();
   if(origin){
     if(!(deps.corsOrigins??[]).includes(origin)){
       json(res,403,buildApiError(new Error("CORS_ORIGIN_NOT_ALLOWED"),correlationId),correlationId);return;
     }
     res.setHeader("access-control-allow-origin",origin);
     res.setHeader("vary","Origin");
     res.setHeader("access-control-allow-methods","GET,POST,OPTIONS");
     res.setHeader("access-control-allow-headers","Authorization,Content-Type,Last-Event-ID,X-Correlation-ID,X-Idempotency-Key");
     res.setHeader("access-control-expose-headers","X-Correlation-ID");
     res.setHeader("access-control-max-age","600");
     if(method==="OPTIONS"){res.statusCode=204;res.end();return;}
   }
   if(path==="/health/live" && method==="GET"){json(res,200,{ok:true,status:"live"},correlationId);return;}
   if(path==="/health/ready" && method==="GET"){await deps.db.query("SELECT 1");json(res,200,{ok:true,status:"ready"},correlationId);return;}
   if(!r){json(res,404,buildApiError(new Error("API_ROUTE_NOT_ALLOWLISTED"),correlationId),correlationId);return;}
   const auth=await deps.authenticate(req); assertSessionActive(auth.session); assertSessionOrganization(auth.session,auth.principal.organizationId??"");
   const routeAuth=authorizeRoute({method,route:path,authClass:"member"});
   if(!routeAuth.allowed)throw new Error(routeAuth.reason);
   const organizationId=auth.principal.organizationId; if(!auth.tenantId)throw new Error("TENANT_CONTEXT_REQUIRED");
   if(!organizationId)throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
   assertAuthorized(auth.principal,{organizationId,requestedPermission:permissionFor(r[0],method)});
   if(r[0]==="stream"){
    if(method!=="GET")throw new Error("REALTIME_METHOD_NOT_ALLOWED");
    if(!deps.realtime)throw new Error("REALTIME_NOT_CONFIGURED");
    const lastEventId=String(req.headers["last-event-id"]??"").trim();
    let replayCursor:bigint|undefined;
    if(lastEventId){
      if(!deps.realtimeStore)throw new Error("REALTIME_DURABLE_REPLAY_NOT_CONFIGURED");
      try{replayCursor=BigInt(lastEventId);}catch{throw new Error("REALTIME_INVALID_CURSOR");}
      if(replayCursor<0n)throw new Error("REALTIME_INVALID_CURSOR");
    }
    res.statusCode=200;res.setHeader("content-type","text/event-stream; charset=utf-8");res.setHeader("cache-control","no-cache, no-transform");res.setHeader("x-content-type-options","nosniff");res.setHeader("x-frame-options","DENY");res.setHeader("cross-origin-resource-policy","same-origin");res.setHeader("x-permitted-cross-domain-policies","none");res.setHeader("strict-transport-security","max-age=31536000; includeSubDomains");res.setHeader("connection","keep-alive");res.write(": connected\\n\\n");
    let replaying=true;
    const buffered: SchoolRealtimeEvent[]=[];
    const seen=new Set<string>();
    const sendNow=(message:SchoolRealtimeMessage)=>{
      if(message.kind==="event"){
        if(seen.has(message.event.id))return;
        seen.add(message.event.id);
      }
      const accepted=res.write(toSseMessage(message));
      if(accepted)deps.realtime?.ack(correlationId);else res.once("drain",()=>deps.realtime?.ack(correlationId));
    };
    const unsubscribe=deps.realtime.subscribe({
      id:correlationId,tenantId:auth.tenantId,organizationId,
      send:message=>{if(replaying){if(message.kind==="event")buffered.push(message.event);else sendNow(message);}else sendNow(message);},
      close:()=>res.end()
    });
    try{
      if(replayCursor!==undefined){
        const replay=await deps.realtimeStore!.replay(auth.tenantId,organizationId,replayCursor);
        if(replay.state==="CURSOR_EXPIRED"){
          sendNow({kind:"resync_required",reason:"CURSOR_EXPIRED",lastEventId:lastEventId});
          unsubscribe();res.end();return;
        }
        for(const event of replay.events)sendNow({kind:"event",event});
      }
      replaying=false;
      for(const event of buffered)sendNow({kind:"event",event});
    }catch(error){
      replaying=false;unsubscribe();res.end();return;
    }
    req.on("close",()=>unsubscribe());return;
   }
   const bodyText=await readBody(req);
   if(method!=="GET"){
     const contentType=(String(req.headers["content-type"]??"").split(";")[0] ?? "").trim().toLowerCase();
     if(contentType!=="application/json")throw new Error("API_JSON_CONTENT_TYPE_REQUIRED");
   }
   const body=parse(bodyText);
   const requestHash=canonicalRequestHash(method,path,JSON.stringify(body));
   const idem=String(req.headers["x-idempotency-key"]??"");
   if(method!=="GET" && !IDEMPOTENCY_KEY.test(idem))throw new Error("API_IDEMPOTENCY_KEY_INVALID");
   const gateway=new ApiGatewayRepository(deps.db);
   const dedupe=method==="GET"?null:await gateway.reserveOrReplay({organizationId,key:idem,requestHash,route:path,expiresAt:new Date(Date.now()+86400000).toISOString()});
   if(dedupe?.status==="conflict")throw new Error("API_IDEMPOTENCY_CONFLICT");
   if(dedupe?.status==="replay"){
     if(r[0]==="tontine-groups"&&method==="POST"){
       const replayClient=await deps.syncClient();
       try{
         await replayClient.query("BEGIN");
         await replayClient.query("SELECT set_config('tpay.organization_id',$1,true)",[organizationId]);
         const existing=await replayClient.query("SELECT * FROM tontine_groups WHERE organization_id=$1 AND idempotency_key=$2",[organizationId,idem]);
         await replayClient.query("COMMIT");
         if(existing.rows[0]){const response=buildApiSuccess("v1",correlationId,{group:existing.rows[0],replayed:true});res.statusCode=200;json(res,200,response,correlationId);return;}
       }catch(error){try{await replayClient.query("ROLLBACK");}catch{};throw error;}
       finally{replayClient.release?.();}
     }
     res.statusCode=dedupe.statusCode??200;json(res,res.statusCode,{ok:true,replayed:true,requestId:dedupe.requestId},correlationId);return;
   }
   let data:unknown;
   if(r[0].startsWith("tontine-")){
     const client=await deps.syncClient();
     const now=(deps.now??(()=>new Date()))().toISOString();
     try{
       await client.query("BEGIN");
       await client.query("SELECT set_config('tpay.organization_id',$1,true)",[organizationId]);
       const groupId=r.length>1?r[1]:undefined;
       if(r[0]==="tontine-groups"&&method==="POST"){
         const name=String((body as any).name??"").trim();
         const countryCode=String((body as any).countryCode??"").toUpperCase();
         const currency=String((body as any).currency??"").toUpperCase();
         const frequency=String((body as any).frequency??"");
         const contributionMode=String((body as any).contributionMode??"");
         const minimum=String((body as any).minimumAmountMinor??"");
         const fixed=(body as any).fixedAmountMinor==null?null:String((body as any).fixedAmountMinor);
         const target=(body as any).targetMinor==null?null:String((body as any).targetMinor);
         const maxMembers=(body as any).maxMembers==null?null:Number((body as any).maxMembers);
         const governance=String((body as any).governance??"member_vote");
         if(!name||name.length>120||!/^[A-Z]{2}$/.test(countryCode)||!/^[A-Z]{3}$/.test(currency)||
           !["daily","weekly","biweekly","monthly"].includes(frequency)||
           !["fixed","flexible","target"].includes(contributionMode)||
           !/^\\d+$/.test(minimum)||BigInt(minimum)<=0n||
           (fixed!==null&&(!/^\\d+$/.test(fixed)||BigInt(fixed)<=0n))||
           (target!==null&&(!/^\\d+$/.test(target)||BigInt(target)<=0n))||
           (maxMembers!==null&&(!Number.isInteger(maxMembers)||maxMembers<2||maxMembers>10000))||
           !["member_vote","founder","committee"].includes(governance))throw new Error("TONTINE_GROUP_INPUT_INVALID");
         const groupIdNew=randomUUID();
         const created=await client.query(
           `INSERT INTO tontine_groups
            (id,organization_id,name,country_code,currency,frequency,contribution_mode,target_minor,
             fixed_amount_minor,minimum_amount_minor,max_members,governance,created_by,created_at,idempotency_key)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
           [groupIdNew,organizationId,name,countryCode,currency,frequency,contributionMode,target,fixed,minimum,maxMembers,governance,auth.principal.userId,now,idem]
         );
         if(!created.rows[0])throw new Error("TONTINE_GROUP_CREATE_FAILED");
         await client.query(
           `INSERT INTO tontine_memberships (id,organization_id,group_id,client_id,role,status,joined_at)
            VALUES ($1,$2,$3,$4,'founder','active',$5)`,
           [randomUUID(),organizationId,groupIdNew,auth.principal.userId,now]
         );
         data={group:created.rows[0],replayed:false};
       } else if(r[0]==="tontine-groups"&&method==="GET"){
         const limit=Math.max(1,Math.min(100,Number(new URL("https://tpay.invalid"+rawUrl).searchParams.get("limit")??"25")||25));
         const listed=await client.query(
           `SELECT g.*,COUNT(m.id)::integer AS active_member_count
            FROM tontine_groups g LEFT JOIN tontine_memberships m
              ON m.organization_id=g.organization_id AND m.group_id=g.id AND m.status='active'
            WHERE g.organization_id=$1 GROUP BY g.id ORDER BY g.created_at DESC,g.id LIMIT $2`,
           [organizationId,limit]
         );
         data={items:listed.rows};
       } else {
         const group=await client.query("SELECT id,currency FROM tontine_groups WHERE organization_id=$1 AND id=$2",[organizationId,groupId]);
         if(!group.rows[0])throw new Error("TONTINE_GROUP_NOT_FOUND");
         const payload=body as any;
         if(r[0]==="tontine-commission"){
           const version=String(payload.version??"").trim(),transactionLevel=String(payload.transactionLevel??"");
           const currency=String(payload.currency??"").toUpperCase(),payer=String(payload.payer??"");
           const memberShareBps=Number(payload.memberShareBps),effectiveFrom=String(payload.effectiveFrom??"");
           const components=Array.isArray(payload.components)?payload.components.map((x:any)=>({recipient:String(x.recipient),rateBps:Number(x.rateBps),enabled:x.enabled===true,...(x.minMinor!==undefined?{minMinor:BigInt(String(x.minMinor))}:{}),...(x.maxMinor!==undefined?{maxMinor:BigInt(String(x.maxMinor))}:{})})):[];
           if(!version||!["CONTRIBUTION","BENEFICIARY_PAYOUT","TRANSFER","OPTIONAL_SERVICE"].includes(transactionLevel)||
             currency!==String(group.rows[0].currency)||!["MEMBER","BENEFICIARY","SPLIT"].includes(payer)||
             !Number.isInteger(memberShareBps)||memberShareBps<0||memberShareBps>10000||
             !Number.isFinite(Date.parse(effectiveFrom))||components.length===0||
             components.some((x:any)=>!["TPAY","PARTNER","AGENT","RESERVE","TAX","OPTIONAL_SERVICE"].includes(x.recipient)||!Number.isInteger(x.rateBps)||x.rateBps<0||x.rateBps>10000))throw new Error("TONTINE_COMMISSION_INPUT_INVALID");
           const policyId=randomUUID();
           const policy:any={id:policyId,organizationId,groupId,version,transactionLevel,currency,state:"DRAFT",payer,memberShareBps,effectiveFrom,...(payload.effectiveUntil?{effectiveUntil:String(payload.effectiveUntil)}:{}),components,createdBy:auth.principal.userId,proposalOrigin:"COMMUNITY_ADMIN",policyHash:""};
           const canonical=JSON.stringify({id:policy.id,organizationId:policy.organizationId,groupId:policy.groupId,version:policy.version,transactionLevel:policy.transactionLevel,currency:policy.currency,payer:policy.payer,memberShareBps:policy.memberShareBps,effectiveFrom:new Date(policy.effectiveFrom).toISOString(),effectiveUntil:policy.effectiveUntil?new Date(policy.effectiveUntil).toISOString():null,proposalOrigin:policy.proposalOrigin,components:[...components].sort((a:any,b:any)=>a.recipient.localeCompare(b.recipient)).map((c:any)=>({recipient:c.recipient,rateBps:c.rateBps,enabled:c.enabled,minMinor:c.minMinor?.toString()??null,maxMinor:c.maxMinor?.toString()??null}))});
           const {createHash}=await import("node:crypto");policy.policyHash=createHash("sha256").update(canonical).digest("hex");
           if((payer==="MEMBER"&&memberShareBps!==10000)||(payer==="BENEFICIARY"&&memberShareBps!==0)||(payer==="SPLIT"&&(memberShareBps===0||memberShareBps===10000))||components.reduce((sum:number,x:any)=>sum+(x.enabled?x.rateBps:0),0)>10000)throw new Error("TONTINE_COMMISSION_POLICY_INVALID");
           await client.query(
             `INSERT INTO community_tontine_commission_policies
              (id,organization_id,group_id,version,transaction_level,currency,state,payer_mode,member_share_bps,effective_from,effective_until,components,policy_hash,created_by,approved_by,created_at,proposal_origin)
              VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',$7,$8,$9::timestamptz,$10::timestamptz,$11::jsonb,$12,$13,NULL,$14::timestamptz,'COMMUNITY_ADMIN')`,
             [policyId,organizationId,groupId,version,transactionLevel,currency,payer,memberShareBps,effectiveFrom,payload.effectiveUntil??null,JSON.stringify(components.map((x:any)=>({...x,minMinor:x.minMinor?.toString(),maxMinor:x.maxMinor?.toString()}))),policy.policyHash,auth.principal.userId,now]
           );
           await client.query(
             `INSERT INTO community_tontine_commission_policy_audit (id,organization_id,group_id,policy_id,actor_id,action,reason,occurred_at)
              VALUES ($1,$2,$3,$4,$5,'CREATED','Commission policy created as draft',$6::timestamptz)`,
             [randomUUID(),organizationId,groupId,policyId,auth.principal.userId,now]
           );
           data={policy};
         } else if(r[0]==="tontine-role"){
           const grantor=await client.query("SELECT role FROM community_tontine_role_grants WHERE organization_id=$1 AND group_id=$2 AND actor_id=$3 AND revoked_at IS NULL AND expires_at>$4::timestamptz ORDER BY created_at DESC LIMIT 1",[organizationId,groupId,auth.principal.userId,now]);
           const grantorRole=String(grantor.rows[0]?.role??"FOUNDER");
           const targetRole=String(payload.role??"");
           const permissions=Array.isArray(payload.permissions)?payload.permissions.map(String):[];
           const validFrom=String(payload.validFrom??""),expiresAt=String(payload.expiresAt??"");
           if(!/^[0-9a-f-]{36}$/i.test(String(payload.actorId??""))||!["COMMUNITY_ADMIN","PRESIDENT","TREASURER","SECRETARY","COLLECTOR","CONTROLLER","MEDIATOR","MEMBER"].includes(targetRole)||
             !permissions.every((p:string)=>["member.invite","member.remove","contribution.collect","contribution.verify","governance.propose","governance.vote","dispute.mediate","report.read"].includes(p))||
             !Number.isFinite(Date.parse(validFrom))||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.parse(validFrom)||Date.parse(expiresAt)<=Date.parse(now))throw new Error("TONTINE_ROLE_GRANT_INPUT_INVALID");
           if(!["FOUNDER","COMMUNITY_ADMIN"].includes(grantorRole))throw new Error("TONTINE_ROLE_GRANT_FORBIDDEN");
           if(String(payload.actorId)===auth.principal.userId)throw new Error("TONTINE_ROLE_GRANT_SELF_FORBIDDEN");
           await client.query(
             `INSERT INTO community_tontine_role_grants (id,organization_id,group_id,actor_id,role,permissions,granted_by,valid_from,expires_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz)`,
             [randomUUID(),organizationId,groupId,payload.actorId,targetRole,permissions,auth.principal.userId,validFrom,expiresAt]
           );
           await client.query(
             `INSERT INTO community_tontine_commercial_audit (id,organization_id,group_id,object_type,object_id,action,actor_id,reason,payload,occurred_at)
              VALUES ($1,$2,$3,'ROLE_GRANT',$4,'GRANTED',$5,'Temporary role grant created',$6::jsonb,$7::timestamptz)`,
             [randomUUID(),organizationId,groupId,randomUUID(),auth.principal.userId,JSON.stringify({actorId:payload.actorId,role:targetRole,permissions,validFrom,expiresAt}),now]
           );
           data={role:targetRole,actorId:payload.actorId,permissions,validFrom,expiresAt};
         } else if(r[0]==="tontine-promotion"){
           const code=String(payload.code??"").trim().toUpperCase(),title=String(payload.title??"").trim();
           const startsAt=String(payload.startsAt??""),endsAt=String(payload.endsAt??"");
           const currency=String(payload.currency??"").toUpperCase(),reward=String(payload.rewardMinor??""),budget=String(payload.maxBudgetMinor??"");
           const maxRedemptions=Number(payload.maxRedemptions),channels=Array.isArray(payload.allowedChannels)?payload.allowedChannels.map(String):[];
           if(!code||!title||!Number.isFinite(Date.parse(startsAt))||!Number.isFinite(Date.parse(endsAt))||Date.parse(endsAt)<=Date.parse(startsAt)||
             currency!==String(group.rows[0].currency)||!/^\\d+$/.test(reward)||!/^\\d+$/.test(budget)||!Number.isInteger(maxRedemptions)||maxRedemptions<1||
             BigInt(reward)*BigInt(maxRedemptions)>BigInt(budget)||channels.length===0||!channels.every((x:string)=>["LINK","QR","USSD","AGENT","SOCIAL"].includes(x)))throw new Error("TONTINE_PROMOTION_INPUT_INVALID");
           const campaignId=randomUUID();
           await client.query(
             `INSERT INTO community_tontine_promotion_campaigns
              (id,organization_id,group_id,code,title,state,starts_at,ends_at,currency,reward_minor,max_redemptions,accepted_redemptions,max_budget_minor,committed_budget_minor,allowed_channels,created_by,approved_by)
              VALUES ($1,$2,$3,$4,$5,'DRAFT',$6::timestamptz,$7::timestamptz,$8,$9::numeric,$10,0,$11::numeric,0,$12,$13,NULL)`,
             [campaignId,organizationId,groupId,code,title,startsAt,endsAt,currency,reward,maxRedemptions,budget,channels,auth.principal.userId]
           );
           await client.query(
             `INSERT INTO community_tontine_commercial_audit (id,organization_id,group_id,object_type,object_id,action,actor_id,reason,payload,occurred_at)
              VALUES ($1,$2,$3,'PROMOTION_CAMPAIGN',$4,'CREATED',$5,'Promotion campaign created as draft',$6::jsonb,$7::timestamptz)`,
             [randomUUID(),organizationId,groupId,campaignId,auth.principal.userId,JSON.stringify({code,currency,rewardMinor:reward,maxRedemptions,maxBudgetMinor:budget,allowedChannels:channels}),now]
           );
           data={id:campaignId,state:"DRAFT",code,title};
         } else if(r[0]==="tontine-protection"){
           const tiers=Array.isArray(payload.tiers)?payload.tiers:[];
           if(tiers.length!==3)throw new Error("TONTINE_PROTECTION_THREE_TIERS_REQUIRED");
           const policyId=randomUUID();
           const policy:any={id:policyId,organizationId,groupId,version:String(payload.version??""),currency:String(payload.currency??"").toUpperCase(),state:"DRAFT",proposalOrigin:"COMMUNITY_ADMIN",riskBearer:"LICENSED_INSURER",insurerPartnerId:String(payload.insurerPartnerId??""),insurerLicenseReference:String(payload.insurerLicenseReference??""),insurerContractReference:String(payload.insurerContractReference??""),insurerLicenseVerified:false,insurerContractVerified:false,effectiveFrom:String(payload.effectiveFrom??""),...(payload.effectiveUntil?{effectiveUntil:String(payload.effectiveUntil)}:{}),tiers:tiers.map((x:any)=>({tier:String(x.tier),premiumRateBps:Number(x.premiumRateBps),coveredInstallments:Number(x.coveredInstallments),gracePeriodDays:Number(x.gracePeriodDays),waitingPeriodDays:Number(x.waitingPeriodDays),maxClaimMinor:BigInt(String(x.maxClaimMinor))})),createdBy:auth.principal.userId,policyHash:""};
           const {computeTontineProtectionPolicyHash,validateTontineProtectionPolicy}=await import("../../microfinance/src/community-tontine-protection.js");
           policy.policyHash=computeTontineProtectionPolicyHash(policy);
           validateTontineProtectionPolicy(policy);
           await client.query(
             `INSERT INTO community_tontine_protection_policies
              (id,organization_id,group_id,version,currency,state,proposal_origin,risk_bearer,insurer_partner_id,insurer_license_reference,insurer_contract_reference,insurer_license_verified,insurer_contract_verified,effective_from,effective_until,tiers,policy_hash,created_by,created_at)
              VALUES ($1,$2,$3,$4,$5,'DRAFT','COMMUNITY_ADMIN','LICENSED_INSURER',$6,$7,$8,false,false,$9::timestamptz,$10::timestamptz,$11::jsonb,$12,$13,$14::timestamptz)`,
             [policyId,organizationId,groupId,policy.version,policy.currency,policy.insurerPartnerId,policy.insurerLicenseReference,policy.insurerContractReference,policy.effectiveFrom,policy.effectiveUntil??null,JSON.stringify(policy.tiers.map((x:any)=>({...x,maxClaimMinor:x.maxClaimMinor.toString()}))),policy.policyHash,auth.principal.userId,now]
           );
           await client.query(
             `INSERT INTO community_tontine_protection_events (id,organization_id,group_id,actor_id,event_type,payload,occurred_at)
              VALUES ($1,$2,$3,$4,'POLICY_PROPOSED',$5::jsonb,$6::timestamptz)`,
             [randomUUID(),organizationId,groupId,auth.principal.userId,JSON.stringify({policyId,version:policy.version,policyHash:policy.policyHash}),now]
           );
           data={...policy,insurerVerificationRequired:true};
         } else throw new Error("TONTINE_ROUTE_NOT_IMPLEMENTED");
       }
       await client.query("COMMIT");
     }catch(error){
       try{await client.query("ROLLBACK");}catch{}
       throw error;
     }finally{client.release?.();}
   } else if(r[0]==="actor"){
    const q=await deps.db.query("SELECT actor_id,organization_id,kind,active,data,version,updated_at FROM education_actors WHERE tenant_id=$1 AND organization_id=$2 AND actor_id=$3",[auth.tenantId,organizationId,r[1]]);
    if(!q.rows[0]){res.statusCode=404;json(res,404,buildApiError(new Error("ACTOR_NOT_FOUND"),correlationId),correlationId);return;}
    data=q.rows[0];
   } else if(r[0]==="sync"){
    const event={...body,tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,payloadHash:computeSyncPayloadHash((body as any).payload)};
    const syncClient=await deps.syncClient();
    try{ data=await new PostgresEducationSyncStore(syncClient).accept(event as any); }
    finally{ syncClient.release?.(); }
   } else if(r[0]==="attendance"){
    const incoming=body as AttendanceRecord; incoming.organizationId=organizationId;
    const q=await deps.db.query("SELECT * FROM education_attendance WHERE tenant_id=$1 AND organization_id=$2 AND student_id=$3 AND class_id=$4",[auth.tenantId,organizationId,incoming.studentId,incoming.classId]);
    const existing=(q.rows[0]??null) as AttendanceRecord|null;
    const accepted=reconcileAttendance(existing,incoming);
    await deps.db.query(`INSERT INTO education_attendance(student_id,class_id,tenant_id,organization_id,status,recorded_by,occurred_at,source,correction_reason,version,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT(tenant_id,organization_id,student_id,class_id) DO UPDATE SET status=EXCLUDED.status,recorded_by=EXCLUDED.recorded_by,occurred_at=EXCLUDED.occurred_at,source=EXCLUDED.source,correction_reason=EXCLUDED.correction_reason,version=EXCLUDED.version,updated_at=now() WHERE education_attendance.version < EXCLUDED.version`,[accepted.studentId,accepted.classId,auth.tenantId,organizationId,accepted.status,accepted.recordedBy,accepted.occurredAt,accepted.source,accepted.correctionReason??null,accepted.version]);
    data=accepted;
   } else if(r[0]==="work-create"){
    const item=body as WorkItem; if(item.organizationId!==organizationId)throw new Error("RESOURCE_ORGANIZATION_MISMATCH");
    await deps.db.query("INSERT INTO education_work_items(work_item_id,tenant_id,organization_id,status,priority,due_at,owner_actor_id,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[item.id,auth.tenantId,organizationId,item.status,item.priority,item.dueAt,item.ownerActorId,item.version]);
    data=item;
   } else if(r[0]==="work"){
    const q=await deps.db.query("SELECT * FROM education_work_items WHERE tenant_id=$1 AND organization_id=$2 AND work_item_id=$3",[auth.tenantId,organizationId,r[1]]);
    if(!q.rows[0])throw new Error("WORK_ITEM_NOT_FOUND"); const item=q.rows[0] as unknown as WorkItem;
    const next=r[2]==="claim"?claimWorkItem(item,auth.principal.userId):resolveWorkItem(item,auth.principal.userId);
    const updated=await deps.db.query("UPDATE education_work_items SET status=$1,owner_actor_id=$2,version=$3,updated_at=now() WHERE tenant_id=$4 AND organization_id=$5 AND work_item_id=$6 AND version=$7 RETURNING *",[next.status,next.ownerActorId,next.version,auth.tenantId,organizationId,r[1],item.version]);
    if(!updated.rows[0])throw new Error("CONCURRENT_MODIFICATION"); data=updated.rows[0];
   } else if(r[0]==="service-create"){
    const item={...(body as ServiceRequest),organizationId,requesterId:auth.principal.userId};
    await deps.db.query("INSERT INTO education_service_requests(request_id,tenant_id,organization_id,requester_id,service_code,status,priority,assigned_to,created_at,due_at,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[item.id,auth.tenantId,organizationId,item.requesterId,item.serviceCode,item.status,item.priority,item.assignedTo,item.createdAt,item.dueAt,item.version]); data=item;
   } else {
    const q=await deps.db.query("SELECT * FROM education_service_requests WHERE tenant_id=$1 AND organization_id=$2 AND request_id=$3",[auth.tenantId,organizationId,r[1]]);
    if(!q.rows[0])throw new Error("SERVICE_REQUEST_NOT_FOUND");
    const next=transitionService(q.rows[0] as unknown as ServiceRequest,body as any);
    const updated=await deps.db.query("UPDATE education_service_requests SET status=$1,version=$2,updated_at=now() WHERE tenant_id=$3 AND organization_id=$4 AND request_id=$5 AND version=$6 RETURNING *",[next.status,next.version,auth.tenantId,organizationId,r[1],Number((q.rows[0] as any).version)]);
    if(!updated.rows[0])throw new Error("CONCURRENT_MODIFICATION"); data=updated.rows[0];
   }
   if(deps.realtime && deps.realtimeStore && r[0]!=="actor"){
    const typeMap:Record<string,SchoolRealtimeEvent["type"]>={sync:"sync.accepted",attendance:"attendance.changed","work-create":"work_item.changed",work:"work_item.changed","service-create":"service_request.changed","service-transition":"service_request.changed"};
    const eventType=typeMap[r[0]];
    if(eventType){
      const event:SchoolRealtimeEvent={
        id:correlationId,
        tenantId:auth.tenantId,
        organizationId,
        type:eventType,
        occurredAt:(deps.now??(()=>new Date()))().toISOString(),
        entityId:String((data as any)?.id??(data as any)?.request_id??(data as any)?.work_item_id??(data as any)?.eventId??correlationId),
        version:Number((data as any)?.version??1),
        data:{operation:method,route:path}
      };
      const streamSequence=await deps.realtimeStore.append(event);
      event.streamSequence=streamSequence.toString();
      deps.realtime.publish(event);
    }
   }
   const response=buildApiSuccess("v1",correlationId,data);
   if(dedupe?.status==="reserved")await gateway.completeIdempotency({requestId:dedupe.requestId,state:"succeeded",responseHash:canonicalRequestHash("RESPONSE",path,JSON.stringify(response)),statusCode:200});
   await gateway.audit({organizationId,requestId:dedupe?.requestId??correlationId,route:path,actorId:auth.principal.userId,authClass:"member",outcome:"accepted",correlationId,metadata:JSON.stringify({method,path})});
   json(res,200,response,correlationId);
  }catch(error){const status=String(error).startsWith("Error: FORBIDDEN")?403:400;json(res,status,buildApiError(error,correlationId),correlationId);}
 });
}
