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
import { createSchoolClass, updateSchoolClass, archiveSchoolClass, enrollStudent, transferStudent, withdrawStudent } from "./school-commands.js";

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
function errorHttpStatus(error:unknown):number{
 const message=error instanceof Error?error.message:String(error??"");
 const pgCode=typeof error==="object"&&error!==null&&"code" in error?String((error as {code?:unknown}).code??""):"";
 if(message.startsWith("FORBIDDEN")||message==="CORS_ORIGIN_NOT_ALLOWED"||message==="AUTH_PERMISSIONS_EMPTY")return 403;
 if(message.startsWith("AUTH_"))return 401;
 if(message==="API_ROUTE_NOT_ALLOWLISTED"||message.endsWith("_NOT_FOUND"))return 404;
 if(["23505","23503","23514","40001","40P01"].includes(pgCode))return 409;
 if(pgCode==="42501")return 403;
 if(message.includes("CONFLICT")||message.includes("CAPACITY")||message.includes("ALREADY")||message.includes("NOT_ACTIVE")||message.includes("HAS_ACTIVE")||message.includes("SOURCE_CHANGED"))return 409;
 if(message.includes("INVALID")||message.includes("REQUIRED")||message.includes("TOO_LARGE")||message.includes("TOO_LONG")||message.includes("METHOD_NOT_ALLOWED")||message.includes("MISMATCH")||message.includes("REPLAY"))return 400;
 return 500;
}
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
function route(path:string,method:string){
 const parts=path.split("/").filter(Boolean);
 if(parts[0]!=="v1")return null;
 if(parts[1]==="tontine"&&parts[2]==="groups"&&parts.length===3&&method==="GET")return ["tontine-group-list"] as const;
 if(parts[1]==="tontine"&&parts[2]==="groups"&&parts.length===5&&parts[3]&&method==="GET"&&["members","cycles","contributions","governance","cases"].includes(parts[4]??""))return ["tontine-group-"+parts[4],parts[3]] as const;
 if(parts[1]!=="education")return null;
 if(parts[2]==="actors"&&parts.length===4&&parts[3])return ["actor",parts[3]] as const;
 if(parts[2]==="classes"&&parts.length===3&&method==="GET")return ["class-list"] as const;
 if(parts[2]==="classes"&&parts.length===3&&method==="POST")return ["class-create"] as const;
 if(parts[2]==="classes"&&parts.length===4&&parts[3]&&method==="PATCH")return ["class-update",parts[3]] as const;
 if(parts[2]==="classes"&&parts.length===5&&parts[3]&&parts[4]==="archive"&&method==="POST")return ["class-archive",parts[3]] as const;
 if(parts[2]==="enrollments"&&parts.length===3&&method==="POST")return ["enrollment-create"] as const;
 if(parts[2]==="enrollments"&&parts.length===5&&parts[3]&&parts[4]==="transfer"&&method==="POST")return ["enrollment-transfer",parts[3]] as const;
 if(parts[2]==="enrollments"&&parts.length===5&&parts[3]&&parts[4]==="withdraw"&&method==="POST")return ["enrollment-withdraw",parts[3]] as const;
 if(parts[2]==="students"&&parts.length===3)return ["student-list"] as const;
 if(parts[2]==="sync"&&parts[3]==="events"&&parts.length===4)return ["sync"] as const;
 if(parts[2]==="attendance"&&parts.length===3)return ["attendance"] as const;
 if(parts[2]==="work-items"&&parts.length===3)return ["work-create"] as const;
 if(parts[2]==="work-items"&&parts.length===5&&parts[3]&&(parts[4]==="claim"||parts[4]==="resolve"))return ["work",parts[3],parts[4]] as const;
 if(parts[2]==="service-requests"&&parts.length===3)return ["service-create"] as const;
 if(parts[2]==="service-requests"&&parts.length===5&&parts[3]&&parts[4]==="transition")return ["service-transition",parts[3]] as const;
 if(parts[2]==="events"&&parts[3]==="stream"&&parts.length===4)return ["stream"] as const;
 return null;
}
function permissionFor(kind:string):Permission{return kind==="actor"||kind==="class-list"||kind==="student-list"||kind==="tontine-group-list"||kind.startsWith("tontine-group-")?"org.read":kind.startsWith("class-")?"org.manage":"member.manage";}

async function tenantScopedRead(deps:SchoolApiDependencies,tenantId:string,organizationId:string,sql:string,values:unknown[]=[]):Promise<{rows:Record<string,unknown>[];rowCount:number|null}>{
 const client=await deps.syncClient();
 try{
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('tpay.tenant_id',$1,true),set_config('tpay.organization_id',$2,true)",[tenantId,organizationId]);
  const result=await client.query(sql,values);
  await client.query("COMMIT");
  return result;
 }catch(error){
  try{await client.query("ROLLBACK");}catch{}
  throw error;
 }finally{client.release?.();}
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
   const method=(req.method??"GET").toUpperCase(), path=(rawUrl.split("?")[0]??"/"), r=route(path,method);
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
   assertAuthorized(auth.principal,{organizationId,requestedPermission:permissionFor(r[0])});
   let data:unknown;
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
   if(r[0]==="tontine-group-list"){
    if(method!=="GET")throw new Error("TONTINE_READ_METHOD_REQUIRED");
    const query=new URL(rawUrl,"https://tpay.invalid").searchParams;
    const status=query.get("status");
    const allowedStatuses=new Set(["draft","pending_review","active","paused","completed","cancelled"]);
    if(status&&!allowedStatuses.has(status))throw new Error("TONTINE_GROUP_STATUS_INVALID");
    const search=query.get("search")?.trim().slice(0,80);
    const limitRaw=Number(query.get("limit")??"50");
    if(!Number.isInteger(limitRaw)||limitRaw<1||limitRaw>100)throw new Error("TONTINE_PAGE_LIMIT_INVALID");
    const values:unknown[]=[organizationId];
    const filters:string[]=[];
    if(status){values.push(status);filters.push("g.status=$"+values.length);}
    if(search){values.push("%"+search+"%");filters.push("g.name ILIKE $"+values.length);}
    values.push(limitRaw);
    const result=await tenantScopedRead(deps,auth.tenantId,organizationId,
     "SELECT g.id,g.name,g.country_code,g.currency,g.frequency,g.contribution_mode,g.target_minor::text AS target_minor,"+
     "g.fixed_amount_minor::text AS fixed_amount_minor,g.minimum_amount_minor::text AS minimum_amount_minor,g.cycle_number,"+
     "g.max_members,g.governance,g.status,g.created_at,"+
     "(SELECT count(*)::integer FROM tontine_memberships m WHERE m.organization_id=g.organization_id AND m.group_id=g.id AND m.status='active') AS active_member_count,"+
     "(SELECT count(*)::integer FROM tontine_memberships m WHERE m.organization_id=g.organization_id AND m.group_id=g.id AND m.status='pending') AS pending_member_count,"+
     "(SELECT jsonb_build_object('id',c.id,'cycleNumber',c.cycle_number,'startsOn',c.starts_on,'endsOn',c.ends_on,'status',c.status) "+
     "FROM tontine_cycles c WHERE c.organization_id=g.organization_id AND c.group_id=g.id ORDER BY c.cycle_number DESC LIMIT 1) AS latest_cycle,"+
     "(SELECT count(*)::integer FROM tontine_contributions tc WHERE tc.organization_id=g.organization_id AND tc.group_id=g.id AND tc.status='confirmed') AS confirmed_contribution_count,"+
     "(SELECT COALESCE(sum(tc.amount_minor),0)::text FROM tontine_contributions tc WHERE tc.organization_id=g.organization_id AND tc.group_id=g.id AND tc.status='confirmed') AS confirmed_contribution_minor "+
     "FROM tontine_groups g WHERE g.organization_id=$1 "+(filters.length?"AND "+filters.join(" AND ")+" ":"")+
     "ORDER BY g.created_at DESC,g.id LIMIT $"+values.length,values);
    data={items:result.rows,limit:limitRaw};
    await new ApiGatewayRepository(deps.db).audit({organizationId,requestId:correlationId,route:path,actorId:auth.principal.userId,authClass:"member",outcome:"accepted",correlationId,metadata:JSON.stringify({method,path,resource:"tontine_groups",limit:limitRaw,status:status??"all"})});
    json(res,200,buildApiSuccess("v1",correlationId,data),correlationId);return;
   }
   if(typeof r[0]==="string"&&r[0].startsWith("tontine-group-")&&r[1]){
    if(method!=="GET")throw new Error("TONTINE_READ_METHOD_REQUIRED");
    const groupId=r[1];
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(groupId))throw new Error("TONTINE_GROUP_ID_INVALID");
    const query=new URL(rawUrl,"https://tpay.invalid").searchParams;
    const limitRaw=Number(query.get("limit")??"50");
    if(!Number.isInteger(limitRaw)||limitRaw<1||limitRaw>100)throw new Error("TONTINE_PAGE_LIMIT_INVALID");
    const kind=r[0].slice("tontine-group-".length);
    const statements:Record<string,string>={
     members:"SELECT id,client_id,role,status,joined_at,exited_at,selected_microfinance_id FROM tontine_memberships WHERE organization_id=$1 AND group_id=$2 ORDER BY joined_at DESC,id LIMIT $3",
     cycles:"SELECT c.id,c.cycle_number,c.starts_on,c.ends_on,c.status,c.rules_version,c.minimum_amount_minor::text AS minimum_amount_minor,c.currency,c.created_at,c.closed_at,(SELECT count(*)::integer FROM tontine_member_schedules s WHERE s.organization_id=c.organization_id AND s.cycle_id=c.id) AS schedule_count,(SELECT count(*)::integer FROM tontine_beneficiary_slots b WHERE b.organization_id=c.organization_id AND b.cycle_id=c.id) AS beneficiary_count FROM tontine_cycles c WHERE c.organization_id=$1 AND c.group_id=$2 ORDER BY c.cycle_number DESC,c.id LIMIT $3",
     contributions:"SELECT id,membership_id,amount_minor::text AS amount_minor,currency,status,scheduled_for,collected_at,provider_reference,updated_at FROM tontine_contributions WHERE organization_id=$1 AND group_id=$2 ORDER BY scheduled_for DESC,id LIMIT $3",
     governance:"SELECT p.id,p.proposer_id,p.type,p.payload_version,p.status,p.opened_at,p.closes_at,(SELECT count(*)::integer FROM tontine_governance_votes v WHERE v.organization_id=p.organization_id AND v.proposal_id=p.id) AS vote_count FROM tontine_governance_proposals p WHERE p.organization_id=$1 AND p.group_id=$2 ORDER BY p.opened_at DESC,p.id LIMIT $3",
     cases:"SELECT id,type,state,opened_by,payout_id,contribution_id,severity,summary,created_at,updated_at FROM tontine_cases WHERE organization_id=$1 AND group_id=$2 ORDER BY updated_at DESC,id LIMIT $3"
    };
    const sql=statements[kind];
    if(!sql)throw new Error("TONTINE_READ_RESOURCE_NOT_FOUND");
    const result=await tenantScopedRead(deps,auth.tenantId,organizationId,sql,[organizationId,groupId,limitRaw]);
    data={items:result.rows,limit:limitRaw,groupId};
    await new ApiGatewayRepository(deps.db).audit({organizationId,requestId:correlationId,route:path,actorId:auth.principal.userId,authClass:"member",outcome:"accepted",correlationId,metadata:JSON.stringify({method,path,resource:kind,groupId,limit:limitRaw})});
    json(res,200,buildApiSuccess("v1",correlationId,data),correlationId);return;
   }
   if(r[0]==="class-list"){
    if(method!=="GET")throw new Error("EDUCATION_READ_METHOD_REQUIRED");
    const query=new URL(rawUrl,"https://tpay.invalid").searchParams;
    const academicYear=query.get("academicYear");
    if(academicYear && !/^\d{4}[-/]\d{4}$/.test(academicYear))throw new Error("ACADEMIC_YEAR_INVALID");
    const values:unknown[]=[auth.tenantId,organizationId];
    let yearFilter="";
    if(academicYear){values.push(academicYear);yearFilter=" AND c.academic_year=$3";}
    const result=await tenantScopedRead(deps,auth.tenantId,organizationId,
      "SELECT c.class_id,c.name,c.grade_level,c.academic_year,c.capacity,c.status,c.version,c.updated_at,"+
      "COUNT(e.enrollment_id) FILTER (WHERE e.state='ENROLLED')::integer AS enrolled_count "+
      "FROM education_classes c LEFT JOIN education_enrollments e "+
      "ON e.tenant_id=c.tenant_id AND e.organization_id=c.organization_id AND e.class_id=c.class_id AND e.state='ENROLLED' "+
      "WHERE c.tenant_id=$1 AND c.organization_id=$2"+yearFilter+
      " GROUP BY c.tenant_id,c.organization_id,c.class_id ORDER BY c.academic_year DESC,c.grade_level,c.name LIMIT 200",values);
    data={items:result.rows};
    await new ApiGatewayRepository(deps.db).audit({organizationId,requestId:correlationId,route:path,actorId:auth.principal.userId,authClass:"member",outcome:"accepted",correlationId,metadata:JSON.stringify({method,path,resource:"education_classes"})});
    json(res,200,buildApiSuccess("v1",correlationId,data),correlationId);return;
   }
   if(r[0]==="student-list"){
    if(method!=="GET")throw new Error("EDUCATION_READ_METHOD_REQUIRED");
    const query=new URL(rawUrl,"https://tpay.invalid").searchParams;
    const classId=query.get("classId");
    const search=query.get("search")?.trim();
    const limitRaw=Number(query.get("limit")??"50");
    if(!Number.isInteger(limitRaw)||limitRaw<1||limitRaw>100)throw new Error("STUDENT_PAGE_LIMIT_INVALID");
    const values:unknown[]=[auth.tenantId,organizationId];
    const filters:string[]=[];
    if(classId){values.push(classId);filters.push("e.class_id=$"+values.length);}
    if(search){values.push("%"+search.slice(0,80)+"%");filters.push("(s.student_id ILIKE $"+values.length+" OR COALESCE(a.data->>'display_name','') ILIKE $"+values.length+")");}
    values.push(limitRaw);
    const result=await tenantScopedRead(deps,auth.tenantId,organizationId,
      "SELECT s.student_id,s.lifecycle,s.version,s.updated_at,COALESCE(a.data->>'display_name',s.student_id) AS display_name,"+
      "e.enrollment_id,e.class_id,e.academic_year,e.state AS enrollment_state "+
      "FROM education_students s LEFT JOIN education_actors a "+
      "ON a.tenant_id=s.tenant_id AND a.organization_id=s.organization_id AND a.actor_id=s.student_id AND a.kind='STUDENT' AND a.active=true "+
      "LEFT JOIN LATERAL (SELECT e0.enrollment_id,e0.class_id,e0.academic_year,e0.state FROM education_enrollments e0 "+
      "WHERE e0.tenant_id=s.tenant_id AND e0.organization_id=s.organization_id AND e0.student_id=s.student_id AND e0.state='ENROLLED' "+
      "ORDER BY e0.academic_year DESC,e0.created_at DESC LIMIT 1) e ON true "+
      "WHERE s.tenant_id=$1 AND s.organization_id=$2 "+(filters.length?"AND "+filters.join(" AND ")+" ":"")+
      "ORDER BY s.updated_at DESC,s.student_id LIMIT $"+values.length,values);
    data={items:result.rows};
    await new ApiGatewayRepository(deps.db).audit({organizationId,requestId:correlationId,route:path,actorId:auth.principal.userId,authClass:"member",outcome:"accepted",correlationId,metadata:JSON.stringify({method,path,resource:"education_students",limit:limitRaw})});
    json(res,200,buildApiSuccess("v1",correlationId,data),correlationId);return;
   }
   
   const bodyText=await readBody(req);
   if(method!=="GET"){
     const contentType=String(req.headers["content-type"]??"").split(";")[0]?.trim().toLowerCase()??"";
     if(contentType!=="application/json")throw new Error("API_JSON_CONTENT_TYPE_REQUIRED");
   }
   const body=parse(bodyText);
   if(r[0].startsWith("class-")||r[0].startsWith("enrollment-")){
    const key=String(req.headers["x-idempotency-key"]??"");
    const commandClient=await deps.syncClient();
    try{
     const commandContext={tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId};
     let result;
     if(r[0]==="class-create")result=await createSchoolClass(commandClient,commandContext,key,body as Record<string,unknown>);
     else if(r[0]==="class-update")result=await updateSchoolClass(commandClient,commandContext,key,r[1]!,body as Record<string,unknown>);
     else if(r[0]==="class-archive")result=await archiveSchoolClass(commandClient,commandContext,key,r[1]!,body.expectedVersion);
     else if(r[0]==="enrollment-create")result=await enrollStudent(commandClient,commandContext,key,body as Record<string,unknown>);
     else if(r[0]==="enrollment-transfer")result=await transferStudent(commandClient,commandContext,key,r[1]!,body as Record<string,unknown>);
     else result=await withdrawStudent(commandClient,commandContext,key,r[1]!,body.reason);
     json(res,200,buildApiSuccess("v1",correlationId,{commandId:result.commandId,replayed:result.replayed,data:result.data}),correlationId);
    }finally{commandClient.release?.();}
    return;
   }
   const requestHash=canonicalRequestHash(method,path,JSON.stringify(body));
   const idem=String(req.headers["x-idempotency-key"]??"");
   if(method!=="GET" && !IDEMPOTENCY_KEY.test(idem))throw new Error("API_IDEMPOTENCY_KEY_INVALID");
   const gateway=new ApiGatewayRepository(deps.db);
   const dedupe=method==="GET"?null:await gateway.reserveOrReplay({organizationId,key:idem,requestHash,route:path,expiresAt:new Date(Date.now()+86400000).toISOString()});
   if(dedupe?.status==="conflict")throw new Error("API_IDEMPOTENCY_CONFLICT");
   if(dedupe?.status==="replay"){res.statusCode=dedupe.statusCode??200;json(res,res.statusCode,{ok:true,replayed:true,requestId:dedupe.requestId},correlationId);return;}
   if(r[0]==="actor"){
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
  }catch(error){const status=errorHttpStatus(error);json(res,status,buildApiError(error,correlationId),correlationId);}
 });
}
