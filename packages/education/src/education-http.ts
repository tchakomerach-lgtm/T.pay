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
import { validateCommunityTontine, type CommunityTontineGroup } from "../../microfinance/src/community-tontine.js";
import type { UUID } from "../../domain/src/types.js";
import {
  attributeCommunityTontinePromotion,
  computeCommunityTontineCommissionPolicyHash,
  type CommunityTontineAdminRole,
  type CommunityTontineCommissionPolicy,
  type CommunityTontineFeeComponentRule,
  type CommunityTontineFeeRecipient,
  type CommunityTontinePermission,
  type CommunityTontinePromotionCampaign,
  type CommunityTontinePromotionRedemption
} from "../../microfinance/src/community-tontine-commercial-governance.js";
import { PostgresCommunityTontineCommercialRepository } from "../../microfinance/src/community-tontine-commercial-repository.js";
import type { TontineSqlExecutor } from "../../microfinance/src/tontine-repositories.js";

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
 if(parts[1]==="tontine"){
  if(parts[2]==="groups"&&parts.length===3)return ["tontine-groups"] as const;
  if(parts[2]==="groups"&&parts[3]&&parts[4]==="commission-policies"&&parts.length===5)
    return ["tontine-commission-policies",parts[3]] as const;
  if(parts[2]==="groups"&&parts[3]&&parts[4]==="commission-policies"&&parts[5]&&parts[6]==="approve"&&parts.length===7)
    return ["tontine-commission-policy-approve",parts[3],parts[5]] as const;
  if(parts[2]==="groups"&&parts[3]&&parts[4]==="commission-policies"&&parts[5]&&parts[6]==="activate"&&parts.length===7)
    return ["tontine-commission-policy-activate",parts[3],parts[5]] as const;
  if(parts[2]==="groups"&&parts[3]&&parts[4]==="roles"&&parts.length===5)
    return ["tontine-roles",parts[3]] as const;
  if(parts[2]==="groups"&&parts[3]&&parts[4]==="roles"&&parts[5]&&parts[6]==="revoke"&&parts.length===7)
    return ["tontine-role-revoke",parts[3],parts[5]] as const;
  if(parts[2]==="groups"&&parts[3]&&parts[4]==="promotions"&&parts.length===5)
    return ["tontine-promotions",parts[3]] as const;
  if(parts[2]==="groups"&&parts[3]&&parts[4]==="promotions"&&parts[5]&&parts[6]==="approve"&&parts.length===7)
    return ["tontine-promotion-approve",parts[3],parts[5]] as const;
  if(parts[2]==="groups"&&parts[3]&&parts[4]==="promotions"&&parts[5]&&parts[6]==="activate"&&parts.length===7)
    return ["tontine-promotion-activate",parts[3],parts[5]] as const;
  if(parts[2]==="groups"&&parts[3]&&parts[4]==="promotions"&&parts[5]&&parts[6]==="redemptions"&&parts.length===7)
    return ["tontine-promotion-redemptions",parts[3],parts[5]] as const;
  return null;
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
function permissionFor(kind:string,method:string):Permission{
 if(kind==="tontine-groups"||kind==="tontine-commission-policies")return method==="GET"?"community.tontine.read":"community.groups.manage";
 if(kind==="tontine-roles"||kind==="tontine-role-revoke")return "community.members.manage";
 if(kind==="tontine-promotion-redemptions")return "community.tontine.read";
 if(kind.startsWith("tontine-promotion"))return "community.groups.manage";
 if(kind.startsWith("tontine-commission-policy-"))return "community.groups.manage";
 return kind==="actor"?"org.read":"member.manage";
}
export interface SchoolApiServerOptions { serverFactory?: (handler:(req:IncomingMessage,res:ServerResponse)=>void) => Server; }
type SchoolSyncClient = Awaited<ReturnType<SchoolApiDependencies["syncClient"]>>;
async function withTontineOrganizationScope<T>(
 deps:SchoolApiDependencies,
 tenantId:string,
 organizationId:string,
 work:(client:SchoolSyncClient)=>Promise<T>
):Promise<T>{
 const client=await deps.syncClient();
 try{
  await client.query("BEGIN");
  await client.query("SELECT set_config('tpay.tenant_id',$1,true)",[tenantId]);
  await client.query("SELECT set_config('tpay.organization_id',$1,true)",[organizationId]);
  const result=await work(client);
  await client.query("COMMIT");
  return result;
 }catch(error){
  await client.query("ROLLBACK").catch(()=>undefined);
  throw error;
 }finally{
  client.release?.();
 }
}
function tontineNonNegativeAmount(value:unknown,field:string):bigint{
 const raw=typeof value==="number"||typeof value==="string"?String(value):"";
 if(!/^(0|[1-9][0-9]{0,37})$/.test(raw))throw new Error("TONTINE_AMOUNT_INVALID:"+field);
 return BigInt(raw);
}
function commercialRepository(client:SchoolSyncClient):PostgresCommunityTontineCommercialRepository{
 const executor={} as TontineSqlExecutor;
 executor.query=async <Row=Record<string,unknown>>(sql:string,values?:readonly unknown[])=>{
  const result=await client.query(sql,values as unknown[]|undefined);
  return {rows:result.rows as Row[],...(result.rowCount===null?{}:{rowCount:result.rowCount})};
 };
 executor.transaction=async <T>(work:(tx:TontineSqlExecutor)=>Promise<T>)=>work(executor);
 return new PostgresCommunityTontineCommercialRepository(executor);
}
async function assertCommunityTontineAdministrator(
 client:SchoolSyncClient,organizationId:string,groupId:string,actorId:string,now:string
):Promise<CommunityTontineAdminRole>{
 const group=await client.query("SELECT id FROM tontine_groups WHERE organization_id=$1 AND id=$2",[organizationId,groupId]);
 if(!group.rows[0])throw new Error("TONTINE_GROUP_NOT_FOUND");
 const result=await client.query(
  `SELECT role FROM community_tontine_role_grants
   WHERE organization_id=$1 AND group_id=$2 AND actor_id=$3 AND revoked_at IS NULL
     AND valid_from<=$4::timestamptz AND expires_at>$4::timestamptz
     AND role IN ('FOUNDER','COMMUNITY_ADMIN')
   UNION ALL
   SELECT 'FOUNDER' AS role FROM tontine_memberships
   WHERE organization_id=$1 AND group_id=$2 AND client_id=$3 AND status='active' AND role='founder'
   LIMIT 1`,
  [organizationId,groupId,actorId,now]
 );
 const role=String((result.rows[0] as {role?:string}|undefined)?.role??"");
 if(role!=="FOUNDER"&&role!=="COMMUNITY_ADMIN")throw new Error("TONTINE_COMMUNITY_ADMIN_REQUIRED");
 return role;
}
async function assertCommunityTontineMember(
 client:SchoolSyncClient,organizationId:string,groupId:string,actorId:string
):Promise<void>{
 const result=await client.query(
  "SELECT id FROM tontine_memberships WHERE organization_id=$1 AND group_id=$2 AND client_id=$3 AND status='active' LIMIT 1",
  [organizationId,groupId,actorId]
 );
 if(!result.rows[0])throw new Error("TONTINE_ACTIVE_MEMBERSHIP_REQUIRED");
}
function feePolicyView(policy:CommunityTontineCommissionPolicy){
 return {...policy,components:policy.components.map(c=>({
  ...c,...(c.minMinor!==undefined?{minMinor:c.minMinor.toString()}:{}),
  ...(c.maxMinor!==undefined?{maxMinor:c.maxMinor.toString()}:{})
 }))};
}
function tontineAmount(value:unknown,field:string):bigint{
 const raw=typeof value==="number"||typeof value==="string"?String(value):"";
 if(!/^\d{1,38}$/.test(raw))throw new Error("TONTINE_AMOUNT_INVALID");
 const amount=BigInt(raw);
 if(amount<=0n)throw new Error("TONTINE_AMOUNT_INVALID:"+field);
 return amount;
}

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
     const contentType=String(req.headers["content-type"]??"").split(";")[0]?.trim().toLowerCase()??"";
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
     const replayedGroup=await withTontineOrganizationScope(deps,auth.tenantId,organizationId,async client=>{
      const found=await client.query("SELECT * FROM tontine_groups WHERE organization_id=$1 AND idempotency_key=$2 LIMIT 1",[organizationId,idem]);
      return found.rows[0]??null;
     });
     if(!replayedGroup)throw new Error("TONTINE_IDEMPOTENCY_RESOURCE_NOT_FOUND");
     const replayResponse=buildApiSuccess("v1",correlationId,{group:replayedGroup,replayed:true});
     json(res,200,replayResponse,correlationId);return;
    }
    res.statusCode=dedupe.statusCode??200;json(res,res.statusCode,{ok:true,replayed:true,requestId:dedupe.requestId},correlationId);return;
   }
   let data:unknown;
   if(r[0]==="tontine-groups"&&method==="GET"){
    const query=new URL(rawUrl,"https://tpay.invalid").searchParams;
    const requestedStatus=query.get("status");
    const allowedStatuses=new Set(["draft","pending_review","active","paused","completed","cancelled"]);
    if(requestedStatus&&!allowedStatuses.has(requestedStatus))throw new Error("TONTINE_GROUP_STATUS_FILTER_INVALID");
    const limitRaw=Number(query.get("limit")??"100");
    if(!Number.isInteger(limitRaw)||limitRaw<1||limitRaw>100)throw new Error("TONTINE_GROUP_LIMIT_INVALID");
    data=await withTontineOrganizationScope(deps,auth.tenantId,organizationId,async client=>{
     const result=await client.query(
      `SELECT g.*,
        (SELECT count(*)::int FROM tontine_memberships m WHERE m.organization_id=g.organization_id AND m.group_id=g.id AND m.status='active') AS active_member_count,
        (SELECT count(*)::int FROM tontine_memberships m WHERE m.organization_id=g.organization_id AND m.group_id=g.id AND m.status='pending') AS pending_member_count,
        (SELECT jsonb_build_object('id',c.id,'cycleNumber',c.cycle_number,'startsOn',c.starts_on,'endsOn',c.ends_on,'status',c.status)
           FROM tontine_cycles c WHERE c.organization_id=g.organization_id AND c.group_id=g.id
           ORDER BY c.cycle_number DESC LIMIT 1) AS latest_cycle,
        (SELECT count(*)::int FROM tontine_contributions tc WHERE tc.organization_id=g.organization_id AND tc.group_id=g.id AND tc.status='confirmed') AS confirmed_contribution_count,
        COALESCE((SELECT sum(tc.amount_minor) FROM tontine_contributions tc WHERE tc.organization_id=g.organization_id AND tc.group_id=g.id AND tc.status='confirmed'),0)::text AS confirmed_contribution_minor
       FROM tontine_groups g
       WHERE g.organization_id=$1 AND ($2::text IS NULL OR g.status=$2)
       ORDER BY g.created_at DESC,g.id
       LIMIT $3`,
      [organizationId,requestedStatus,limitRaw]
     );
     return {items:result.rows};
    });
   }else if(r[0]==="tontine-groups"&&method==="POST"){
    const input=body as Record<string,unknown>;
    if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("TONTINE_GROUP_PAYLOAD_INVALID");
    if(!["daily","weekly","monthly"].includes(String(input.frequency)))throw new Error("TONTINE_FREQUENCY_INVALID");
    if(!["fixed","variable","goal"].includes(String(input.contributionMode)))throw new Error("TONTINE_CONTRIBUTION_MODE_INVALID");
    if(!["founder_managed","member_vote"].includes(String(input.governance??"member_vote")))throw new Error("TONTINE_GOVERNANCE_INVALID");
    const now=(deps.now??(()=>new Date()))().toISOString();
    const group:CommunityTontineGroup={
     id:randomUUID() as UUID,
     organizationId:organizationId as UUID,
     name:typeof input.name==="string"?input.name.trim():"",
     countryCode:typeof input.countryCode==="string"?input.countryCode.toUpperCase():"TG",
     currency:typeof input.currency==="string"?input.currency.toUpperCase():"XOF",
     frequency:input.frequency as CommunityTontineGroup["frequency"],
     contributionMode:input.contributionMode as CommunityTontineGroup["contributionMode"],
     minimumAmountMinor:tontineAmount(input.minimumAmountMinor,"minimumAmountMinor"),
     cycleNumber:1,
     governance:(input.governance??"member_vote") as CommunityTontineGroup["governance"],
     status:"draft",
     createdBy:auth.principal.userId as UUID,
     createdAt:now
    };
    if(input.contributionMode==="fixed")group.fixedAmountMinor=tontineAmount(input.fixedAmountMinor,"fixedAmountMinor");
    if(input.contributionMode==="goal")group.targetMinor=tontineAmount(input.targetMinor,"targetMinor");
    if(input.maxMembers!==undefined&&input.maxMembers!==null&&input.maxMembers!==""){
     const maxMembers=Number(input.maxMembers);
     if(!Number.isInteger(maxMembers)||maxMembers<2||maxMembers>100000)throw new Error("TONTINE_MAX_MEMBERS_INVALID");
     group.maxMembers=maxMembers;
    }
    validateCommunityTontine(group);
    const membershipId=randomUUID() as UUID;
    const created=await withTontineOrganizationScope(deps,auth.tenantId,organizationId,async client=>{
     const saved=await client.query(
      `INSERT INTO tontine_groups
       (id,organization_id,name,country_code,currency,frequency,contribution_mode,target_minor,fixed_amount_minor,
        minimum_amount_minor,cycle_number,max_members,governance,status,created_by,created_at,idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11,$12,'draft',$13,$14,$15)
       RETURNING *`,
      [group.id,organizationId,group.name,group.countryCode,group.currency,group.frequency,group.contributionMode,
       group.targetMinor?.toString()??null,group.fixedAmountMinor?.toString()??null,group.minimumAmountMinor.toString(),
       group.maxMembers??null,group.governance,group.createdBy,group.createdAt,idem]
     );
     if(!saved.rows[0])throw new Error("TONTINE_GROUP_CREATE_FAILED");
     await client.query(
      `INSERT INTO tontine_memberships(id,organization_id,group_id,client_id,role,status,joined_at)
       VALUES($1,$2,$3,$4,'founder','active',$5)`,
      [membershipId,organizationId,group.id,auth.principal.userId,now]
     );
     return saved.rows[0];
    });
    data={group:{...created,active_member_count:1,pending_member_count:0,latest_cycle:null,confirmed_contribution_count:0,confirmed_contribution_minor:"0"},founderMembershipId:membershipId};
   }else if(r[0]==="tontine-commission-policies"){
    const groupId=r[1] as string;
    const now=(deps.now??(()=>new Date()))().toISOString();
    data=await withTontineOrganizationScope(deps,auth.tenantId,organizationId,async client=>{
     await assertCommunityTontineAdministrator(client,organizationId,groupId,auth.principal.userId,now);
     const repository=commercialRepository(client);
     if(method==="GET"){
      const query=new URL(rawUrl,"https://tpay.invalid").searchParams;
      const level=String(query.get("level")??"CONTRIBUTION");
      const currency=String(query.get("currency")??"XOF").toUpperCase();
      const state=String(query.get("state")??"ACTIVE").toUpperCase();
      if(!["CONTRIBUTION","BENEFICIARY_PAYOUT","TRANSFER","OPTIONAL_SERVICE"].includes(level))throw new Error("TONTINE_COMMISSION_LEVEL_INVALID");
      if(state==="ALL"||state==="DRAFT"||state==="APPROVED"||state==="RETIRED"){
       const result=await client.query(
        `SELECT id,organization_id,group_id,version,transaction_level,currency,state,payer_mode,member_share_bps,
                effective_from,effective_until,components,policy_hash,created_by,approved_by
         FROM community_tontine_commission_policies
         WHERE organization_id=$1 AND group_id=$2 AND transaction_level=$3 AND currency=$4
           AND ($5::text='ALL' OR state=$5)
         ORDER BY created_at DESC,id DESC LIMIT 100`,
        [organizationId,groupId,level,currency,state]
       );
       const items=result.rows.map(row=>{
        const raw=typeof row.components==="string"?JSON.parse(row.components as string):row.components;
        return {id:row.id,organizationId:row.organization_id,groupId:row.group_id,version:row.version,
         transactionLevel:row.transaction_level,currency:row.currency,state:row.state,payer:row.payer_mode,
         memberShareBps:row.member_share_bps,effectiveFrom:row.effective_from,effectiveUntil:row.effective_until,
         components:raw,policyHash:row.policy_hash,createdBy:row.created_by,approvedBy:row.approved_by};
       });
       return {items};
      }
      if(state!=="ACTIVE")throw new Error("TONTINE_COMMISSION_POLICY_STATE_FILTER_INVALID");
      const policy=await repository.getActiveCommissionPolicy({
       organizationId:organizationId as UUID,groupId:groupId as UUID,
       transactionLevel:level as CommunityTontineCommissionPolicy["transactionLevel"],currency,now
      });
      return {policy:policy?feePolicyView(policy):null};
     }
     if(method!=="POST")throw new Error("TONTINE_COMMISSION_METHOD_NOT_ALLOWED");
     const input=body as Record<string,unknown>;
     const level=String(input.transactionLevel??"");
     const payer=String(input.payer??"");
     const recipients=new Set(["TPAY","PARTNER","AGENT","RESERVE","TAX","OPTIONAL_SERVICE"]);
     if(!["CONTRIBUTION","BENEFICIARY_PAYOUT","TRANSFER","OPTIONAL_SERVICE"].includes(level))throw new Error("TONTINE_COMMISSION_LEVEL_INVALID");
     if(!["MEMBER","BENEFICIARY","SPLIT"].includes(payer))throw new Error("TONTINE_COMMISSION_PAYER_INVALID");
     if(!Array.isArray(input.components)||input.components.length===0)throw new Error("TONTINE_COMMISSION_COMPONENTS_REQUIRED");
     const components:CommunityTontineFeeComponentRule[]=input.components.map((raw:unknown)=>{
      if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("TONTINE_COMMISSION_COMPONENT_INVALID");
      const item=raw as Record<string,unknown>;
      const recipient=String(item.recipient??"");
      const rateBps=Number(item.rateBps);
      if(!recipients.has(recipient)||!Number.isInteger(rateBps)||rateBps<0||rateBps>10000||typeof item.enabled!=="boolean")throw new Error("TONTINE_COMMISSION_COMPONENT_INVALID");
      return {
       recipient:recipient as CommunityTontineFeeRecipient,rateBps,enabled:item.enabled,
       ...(item.minMinor!==undefined?{minMinor:tontineNonNegativeAmount(item.minMinor,"minMinor")}:{}),
       ...(item.maxMinor!==undefined?{maxMinor:tontineNonNegativeAmount(item.maxMinor,"maxMinor")}:{})
      };
     });
     const policy:CommunityTontineCommissionPolicy={
      id:randomUUID() as UUID,organizationId:organizationId as UUID,groupId:groupId as UUID,
      version:typeof input.version==="string"?input.version.trim():"",
      transactionLevel:level as CommunityTontineCommissionPolicy["transactionLevel"],
      currency:typeof input.currency==="string"?input.currency.toUpperCase():"XOF",
      state:"DRAFT",payer:payer as CommunityTontineCommissionPolicy["payer"],
      memberShareBps:Number(input.memberShareBps),effectiveFrom:typeof input.effectiveFrom==="string"?input.effectiveFrom:now,
      ...(typeof input.effectiveUntil==="string"?{effectiveUntil:input.effectiveUntil}:{}),
      components,createdBy:auth.principal.userId as UUID,policyHash:"0".repeat(64)
     };
     policy.policyHash=computeCommunityTontineCommissionPolicyHash(policy);
     await repository.createCommissionPolicy(policy,randomUUID() as UUID,now);
     return {policy:feePolicyView(policy)};
    });
   }else if(r[0]==="tontine-commission-policy-approve"){
    if(method!=="POST")throw new Error("TONTINE_COMMISSION_METHOD_NOT_ALLOWED");
    const groupId=r[1] as string,policyId=r[2] as string;
    const input=body as Record<string,unknown>;
    const now=(deps.now??(()=>new Date()))().toISOString();
    data=await withTontineOrganizationScope(deps,auth.tenantId,organizationId,async client=>{
     await assertCommunityTontineAdministrator(client,organizationId,groupId,auth.principal.userId,now);
     await commercialRepository(client).approveCommissionPolicy({
      organizationId:organizationId as UUID,groupId:groupId as UUID,policyId:policyId as UUID,
      approverId:auth.principal.userId as UUID,auditId:randomUUID() as UUID,
      reason:typeof input.reason==="string"?input.reason:"",now
     });
     return {policyId,state:"APPROVED"};
    });
   }else if(r[0]==="tontine-commission-policy-activate"){
    if(method!=="POST")throw new Error("TONTINE_COMMISSION_METHOD_NOT_ALLOWED");
    const groupId=r[1] as string,policyId=r[2] as string;
    const input=body as Record<string,unknown>;
    const now=(deps.now??(()=>new Date()))().toISOString();
    data=await withTontineOrganizationScope(deps,auth.tenantId,organizationId,async client=>{
     await assertCommunityTontineAdministrator(client,organizationId,groupId,auth.principal.userId,now);
     await commercialRepository(client).activateCommissionPolicy({
      organizationId:organizationId as UUID,groupId:groupId as UUID,policyId:policyId as UUID,
      actorId:auth.principal.userId as UUID,auditId:randomUUID() as UUID,
      reason:typeof input.reason==="string"?input.reason:"",now
     });
     return {policyId,state:"ACTIVE"};
    });
   }else if(r[0]==="tontine-roles"){
    const groupId=r[1] as string,input=body as Record<string,unknown>;
    const now=(deps.now??(()=>new Date()))().toISOString();
    data=await withTontineOrganizationScope(deps,auth.tenantId,organizationId,async client=>{
     await assertCommunityTontineAdministrator(client,organizationId,groupId,auth.principal.userId,now);
     if(method==="GET"){
      const result=await client.query(
       `SELECT id,actor_id,role,permissions,granted_by,valid_from,expires_at,revoked_at
        FROM community_tontine_role_grants
        WHERE organization_id=$1 AND group_id=$2
        ORDER BY created_at DESC,id DESC LIMIT 100`,
       [organizationId,groupId]
      );
      return {items:result.rows};
     }
     if(method!=="POST")throw new Error("TONTINE_ROLE_METHOD_NOT_ALLOWED");
     const grantorRole=await assertCommunityTontineAdministrator(client,organizationId,groupId,auth.principal.userId,now);
     const targetRole=String(input.role??"");
     const permissions=input.permissions;
     const validPermissions=new Set(["group.manage","member.manage","member.invite","roles.grant","rules.manage","governance.manage","governance.vote","contribution.read","contribution.initiate","contribution.collect","offline.sync","payout.prepare","payout.approve","finance.reconcile","incident.manage","incident.review","reports.read","documents.manage","member.self"]);
     if(!["FOUNDER","COMMUNITY_ADMIN","PRESIDENT","TREASURER","SECRETARY","COLLECTOR","CONTROLLER","MEDIATOR","PAYOUT_APPROVER","MEMBER"].includes(targetRole)||
        !Array.isArray(permissions)||permissions.some(p=>typeof p!=="string"||!validPermissions.has(p)))throw new Error("TONTINE_ROLE_GRANT_PAYLOAD_INVALID");
     const actorId=String(input.actorId??"");
     if(!/^[0-9a-f-]{36}$/i.test(actorId))throw new Error("TONTINE_ROLE_TARGET_INVALID");
     const targetMembership=await client.query(
      "SELECT id FROM tontine_memberships WHERE organization_id=$1 AND group_id=$2 AND client_id=$3 AND status='active' LIMIT 1",
      [organizationId,groupId,actorId]
     );
     if(!targetMembership.rows[0])throw new Error("TONTINE_ROLE_TARGET_MUST_BE_ACTIVE_MEMBER");
     const grantId=randomUUID() as UUID;
     await commercialRepository(client).grantRole({
      id:grantId,organizationId:organizationId as UUID,groupId:groupId as UUID,actorId:actorId as UUID,
      grantorId:auth.principal.userId as UUID,grantorRole,targetRole:targetRole as CommunityTontineAdminRole,
      permissions:permissions as CommunityTontinePermission[],
      validFrom:typeof input.validFrom==="string"?input.validFrom:now,
      expiresAt:typeof input.expiresAt==="string"?input.expiresAt:""
     });
     return {grantId,actorId,role:targetRole,permissions,expiresAt:input.expiresAt};
    });
   }else if(r[0]==="tontine-role-revoke"){
    if(method!=="POST")throw new Error("TONTINE_ROLE_METHOD_NOT_ALLOWED");
    const groupId=r[1] as string,grantId=r[2] as string;
    const now=(deps.now??(()=>new Date()))().toISOString();
    data=await withTontineOrganizationScope(deps,auth.tenantId,organizationId,async client=>{
     await assertCommunityTontineAdministrator(client,organizationId,groupId,auth.principal.userId,now);
     await commercialRepository(client).revokeRole({organizationId:organizationId as UUID,groupId:groupId as UUID,grantId:grantId as UUID,actorId:auth.principal.userId as UUID,revokedAt:now});
     return {grantId,state:"REVOKED"};
    });
   }else if(r[0]==="tontine-promotions"){
    const groupId=r[1] as string,now=(deps.now??(()=>new Date()))().toISOString();
    data=await withTontineOrganizationScope(deps,auth.tenantId,organizationId,async client=>{
     await assertCommunityTontineAdministrator(client,organizationId,groupId,auth.principal.userId,now);
     const repository=commercialRepository(client);
     if(method==="GET"){
      const result=await client.query(
       `SELECT id,code,title,state,starts_at,ends_at,currency,reward_minor,max_redemptions,
               accepted_redemptions,max_budget_minor,committed_budget_minor,allowed_channels,
               created_by,approved_by,created_at
        FROM community_tontine_promotion_campaigns
        WHERE organization_id=$1 AND group_id=$2
        ORDER BY created_at DESC,id DESC LIMIT 100`,
       [organizationId,groupId]
      );
      return {items:result.rows};
     }
     if(method!=="POST")throw new Error("TONTINE_PROMOTION_METHOD_NOT_ALLOWED");
     const input=body as Record<string,unknown>;
     const allowedChannels=new Set(["LINK","QR","USSD","AGENT","SOCIAL"]);
     if(!Array.isArray(input.allowedChannels)||input.allowedChannels.length===0||input.allowedChannels.some(c=>typeof c!=="string"||!allowedChannels.has(c)))throw new Error("TONTINE_PROMOTION_CHANNELS_INVALID");
     const campaign:CommunityTontinePromotionCampaign={
      id:randomUUID() as UUID,organizationId:organizationId as UUID,groupId:groupId as UUID,
      code:typeof input.code==="string"?input.code.trim().toUpperCase():"",
      title:typeof input.title==="string"?input.title.trim():"",
      state:"DRAFT",startsAt:typeof input.startsAt==="string"?input.startsAt:"",
      endsAt:typeof input.endsAt==="string"?input.endsAt:"",
      currency:typeof input.currency==="string"?input.currency.toUpperCase():"XOF",
      rewardMinor:tontineNonNegativeAmount(input.rewardMinor,"rewardMinor"),
      maxRedemptions:Number(input.maxRedemptions),maxBudgetMinor:tontineNonNegativeAmount(input.maxBudgetMinor,"maxBudgetMinor"),
      acceptedRedemptions:0,committedBudgetMinor:0n,createdBy:auth.principal.userId as UUID,
      allowedChannels:input.allowedChannels as CommunityTontinePromotionCampaign["allowedChannels"]
     };
     await repository.createPromotionCampaign(campaign);
     return {campaignId:campaign.id,state:"DRAFT",code:campaign.code};
    });
   }else if(r[0]==="tontine-promotion-approve"){
    if(method!=="POST")throw new Error("TONTINE_PROMOTION_METHOD_NOT_ALLOWED");
    const groupId=r[1] as string,campaignId=r[2] as string,now=(deps.now??(()=>new Date()))().toISOString();
    data=await withTontineOrganizationScope(deps,auth.tenantId,organizationId,async client=>{
     await assertCommunityTontineAdministrator(client,organizationId,groupId,auth.principal.userId,now);
     await commercialRepository(client).approvePromotionCampaign({
      organizationId:organizationId as UUID,groupId:groupId as UUID,campaignId:campaignId as UUID,
      approverId:auth.principal.userId as UUID
     });
     return {campaignId,state:"APPROVED"};
    });
   }else if(r[0]==="tontine-promotion-activate"){
    if(method!=="POST")throw new Error("TONTINE_PROMOTION_METHOD_NOT_ALLOWED");
    const groupId=r[1] as string,campaignId=r[2] as string,now=(deps.now??(()=>new Date()))().toISOString();
    data=await withTontineOrganizationScope(deps,auth.tenantId,organizationId,async client=>{
     await assertCommunityTontineAdministrator(client,organizationId,groupId,auth.principal.userId,now);
     await commercialRepository(client).activatePromotionCampaign({
      organizationId:organizationId as UUID,groupId:groupId as UUID,campaignId:campaignId as UUID,actorId:auth.principal.userId as UUID
     });
     return {campaignId,state:"ACTIVE"};
    });
   }else if(r[0]==="tontine-promotion-redemptions"){
    if(method!=="POST")throw new Error("TONTINE_PROMOTION_METHOD_NOT_ALLOWED");
    const groupId=r[1] as string,campaignId=r[2] as string,now=(deps.now??(()=>new Date()))().toISOString();
    data=await withTontineOrganizationScope(deps,auth.tenantId,organizationId,async client=>{
     await assertCommunityTontineMember(client,organizationId,groupId,auth.principal.userId);
     const repository=commercialRepository(client);
     const campaign=await repository.getPromotionCampaign({
      organizationId:organizationId as UUID,groupId:groupId as UUID,campaignId:campaignId as UUID
     });
     if(!campaign)throw new Error("TONTINE_PROMOTION_NOT_FOUND");
     const input=body as Record<string,unknown>;
     const channel=String(input.channel??"");
     if(!["LINK","QR","USSD","AGENT","SOCIAL"].includes(channel))throw new Error("TONTINE_PROMOTION_CHANNEL_INVALID");
     const candidateId=String(input.candidateId??"");
     if(!/^[0-9a-f-]{36}$/i.test(candidateId))throw new Error("TONTINE_PROMOTION_CANDIDATE_INVALID");
     const redemption=attributeCommunityTontinePromotion({
      campaign,candidateId:candidateId as UUID,ambassadorId:auth.principal.userId as UUID,
      channel:channel as CommunityTontinePromotionRedemption["channel"],now,redemptionId:randomUUID() as UUID
     });
     await repository.reservePromotionRedemption({
      campaign,redemption,actorId:auth.principal.userId as UUID,now
     });
     return {redemption};
    });
   }else if(r[0]==="actor"){
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
   const realtimeStore = deps.realtimeStore;
   if(deps.realtime && realtimeStore && r[0]!=="actor"){
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
      const streamSequence=await realtimeStore.append(event);
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
