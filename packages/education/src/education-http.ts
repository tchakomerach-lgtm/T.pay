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
import { decideChildDataAccess, type EducationActorRole } from "./child-data-firewall.js";

export interface SchoolAuthContext { principal: Principal; session: OrganizationSession; tenantId: string; }
export interface SchoolApiDependencies {
  db: ApiDb & { query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[];rowCount:number|null}> };
  authenticate(request: IncomingMessage): Promise<SchoolAuthContext>;
  syncClient(): ConstructorParameters<typeof PostgresEducationSyncStore>[0] | Promise<ConstructorParameters<typeof PostgresEducationSyncStore>[0]>;
  now?: () => Date;
  realtime?: SchoolRealtimeHub;
  realtimeStore?: Pick<PostgresSchoolRealtimeStore,"replay">;
  corsOrigins?: readonly string[];
}
const json=(res:ServerResponse,status:number,body:unknown,correlationId:string)=>{
  if(res.headersSent||res.writableEnded)return false;
  const data=JSON.stringify(body); res.statusCode=status; res.setHeader("content-type","application/json; charset=utf-8"); res.setHeader("x-correlation-id",correlationId); res.setHeader("connection","close"); res.end(data); return true;
};
async function readBody(req:IncomingMessage):Promise<string>{
  let out="",size=0;
  for await(const chunk of req){ size+=Buffer.byteLength(chunk as string); if(size>1024*1024) throw new Error("PAYLOAD_TOO_LARGE"); out+=chunk; }
  return out;
}
const parse=(s:string)=>s?JSON.parse(s):{};
function route(path:string){
 const parts=path.split("/").filter(Boolean);
 if(parts[0]!=="v1"||parts[1]!=="education")return null;
 if(parts[2]==="actors"&&parts.length===4&&parts[3])return ["actor",parts[3]] as const;
 if(parts[2]==="students"&&parts.length===4&&parts[3])return ["student",parts[3]] as const;
 if(parts[2]==="sync"&&parts[3]==="events"&&parts.length===4)return ["sync"] as const;
 if(parts[2]==="attendance"&&parts.length===3)return ["attendance"] as const;
 if(parts[2]==="work-items"&&parts.length===3)return ["work-create"] as const;
 if(parts[2]==="work-items"&&parts.length===5&&parts[3]&&(parts[4]==="claim"||parts[4]==="resolve"))return ["work",parts[3],parts[4]] as const;
 if(parts[2]==="service-requests"&&parts.length===3)return ["service-create"] as const;
 if(parts[2]==="service-requests"&&parts.length===5&&parts[3]&&parts[4]==="transition")return ["service-transition",parts[3]] as const;
 if(parts[2]==="events"&&parts[3]==="stream"&&parts.length===4)return ["stream"] as const;
 return null;
}
function permissionFor(kind:string):Permission{return kind==="actor"||kind==="student"?"org.read":"member.manage";}
export interface SchoolApiServerOptions { serverFactory?: (handler:(req:IncomingMessage,res:ServerResponse)=>void) => Server; }

export function createSchoolApiServer(deps:SchoolApiDependencies, options:SchoolApiServerOptions={}){
 const serverFactory=options.serverFactory??((handler)=>(createServer(handler)));
 return serverFactory(async(req,res)=>{
  const correlationId=String(req.headers["x-correlation-id"]??newCorrelationId());
  try{
   const method=(req.method??"GET").toUpperCase(), path=((req.url??"/").split("?")[0]??"/"), r=route(path);
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
    res.statusCode=200;res.setHeader("content-type","text/event-stream; charset=utf-8");res.setHeader("cache-control","no-cache, no-transform");res.setHeader("connection","keep-alive");res.write(": connected\\n\\n");
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
   const body=parse(await readBody(req));
   const requestHash=canonicalRequestHash(method,path,JSON.stringify(body));
   const idem=String(req.headers["x-idempotency-key"]??"");
   if(method!=="GET" && idem.length<12) throw new Error("API_IDEMPOTENCY_REQUIRED");
   const gateway=new ApiGatewayRepository(deps.db);
   const dedupe=method==="GET"?null:await gateway.reserveOrReplay({organizationId,key:idem,requestHash,route:path,expiresAt:new Date(Date.now()+86400000).toISOString()});
   if(dedupe?.status==="conflict")throw new Error("API_IDEMPOTENCY_CONFLICT");
   if(dedupe?.status==="replay"){res.statusCode=dedupe.statusCode??200;json(res,res.statusCode,{ok:true,replayed:true,requestId:dedupe.requestId},correlationId);return;}
   let data:unknown;
   if(r[0]==="actor"){
    const q=await deps.db.query("SELECT actor_id,organization_id,kind,active,data,version,updated_at FROM education_actors WHERE tenant_id=$1 AND organization_id=$2 AND actor_id=$3",[auth.tenantId,organizationId,r[1]]);
    if(!q.rows[0]){res.statusCode=404;json(res,404,buildApiError(new Error("ACTOR_NOT_FOUND"),correlationId),correlationId);return;}
    data=q.rows[0];
   } else if(r[0]==="student"){
    if(method!=="GET")throw new Error("STUDENT_READ_ONLY_ROUTE");
    const studentId=r[1];
    const actor=await deps.db.query("SELECT kind,active FROM education_actors WHERE tenant_id=$1 AND organization_id=$2 AND actor_id=$3",[auth.tenantId,organizationId,auth.principal.userId]);
    const actorRole=String(actor.rows[0]?.kind??"") as EducationActorRole;
    if(!actor.rows[0]?.active)throw new Error("ACTOR_INACTIVE");
    if(actorRole==="STUDENT" && auth.principal.userId!==studentId)throw new Error("STUDENT_RESOURCE_OWNER_REQUIRED");
    if(actorRole==="PARENT"){
      const link=await deps.db.query("SELECT 1 FROM education_parent_student_links WHERE tenant_id=$1 AND organization_id=$2 AND parent_actor_id=$3 AND student_id=$4 AND active=true",[auth.tenantId,organizationId,auth.principal.userId,studentId]);
      if(!link.rows[0])throw new Error("PARENT_STUDENT_RELATION_REQUIRED");
    }
    if(actorRole==="TEACHER"){
      const assignment=await deps.db.query("SELECT 1 FROM education_teacher_student_assignments WHERE tenant_id=$1 AND organization_id=$2 AND teacher_actor_id=$3 AND student_id=$4 AND active=true",[auth.tenantId,organizationId,auth.principal.userId,studentId]);
      if(!assignment.rows[0])throw new Error("TEACHER_STUDENT_ASSIGNMENT_REQUIRED");
    }
    if(!["STUDENT","PARENT","TEACHER","ADMIN","DIRECTOR","FOUNDER"].includes(actorRole))throw new Error("STUDENT_ROLE_DENIED");
    const q=await deps.db.query("SELECT student_id,lifecycle,version,updated_at,data FROM education_students WHERE tenant_id=$1 AND organization_id=$2 AND student_id=$3",[auth.tenantId,organizationId,studentId]);
    if(!q.rows[0]){res.statusCode=404;json(res,404,buildApiError(new Error("STUDENT_NOT_FOUND"),correlationId),correlationId);return;}
    const decision=decideChildDataAccess({tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,actorRole,purpose:"ACADEMIC",requestedFields:["student.id","student.name","student.academic_record"],targetStudentId:studentId,export:false,aiProcessing:false});
    if(!decision.allowed)throw new Error("STUDENT_DATA_POLICY_DENIED");
    const raw=(q.rows[0].data??{}) as Record<string,unknown>;
    data={studentId, lifecycle:q.rows[0].lifecycle, version:q.rows[0].version, updatedAt:q.rows[0].updated_at, fields:{
      id:raw.id??studentId,
      name:raw.name??null,
      academicRecord:raw.academic_record??null
    }};
    await gateway.audit({organizationId,requestId:correlationId,route:path,actorId:auth.principal.userId,authClass:"member",outcome:"accepted",correlationId,metadata:JSON.stringify({method,path,studentId,actorRole,purpose:"ACADEMIC",policyVersion:decision.policyVersion})});
   } else if(r[0]==="sync"){
    const rawEvent=body as Record<string,unknown>;
    let sequence:bigint; try{sequence=BigInt(String(rawEvent.sequence??""));}catch{throw new Error("SYNC_INVALID_SEQUENCE");}
    const event={...rawEvent,tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,sequence,payloadHash:computeSyncPayloadHash(rawEvent.payload)};
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
   if(deps.realtime && r[0]!=="actor"){
    const typeMap:Record<string,SchoolRealtimeEvent["type"]>={sync:"sync.accepted",attendance:"attendance.changed","work-create":"work_item.changed",work:"work_item.changed","service-create":"service_request.changed","service-transition":"service_request.changed"};
    const eventType=typeMap[r[0]];
    if(eventType) deps.realtime.publish({id:correlationId,tenantId:auth.tenantId,organizationId,type:eventType,occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:String((data as any)?.id??(data as any)?.request_id??(data as any)?.work_item_id??(data as any)?.eventId??correlationId),version:Number((data as any)?.version??1),data:{operation:method,route:path}});
   }
   const response=buildApiSuccess("v1",correlationId,data);
   if(dedupe?.status==="reserved")await gateway.completeIdempotency({requestId:dedupe.requestId,state:"succeeded",responseHash:canonicalRequestHash("RESPONSE",path,JSON.stringify(response)),statusCode:200});
   await gateway.audit({organizationId,requestId:dedupe?.requestId??correlationId,route:path,actorId:auth.principal.userId,authClass:"member",outcome:"accepted",correlationId,metadata:JSON.stringify({method,path})});
   json(res,200,response,correlationId);
  }catch(error){
    const code=String(error).replace(/^Error:\s*/,"");
    const status=
      code==="SESSION_EXPIRED"||code==="SESSION_REVOKED"||code==="AUTHENTICATION_REQUIRED"?401:
      code==="STUDENT_NOT_FOUND"||code==="ACTOR_NOT_FOUND"||code==="WORK_ITEM_NOT_FOUND"||code==="SERVICE_REQUEST_NOT_FOUND"?404:
      code.startsWith("FORBIDDEN")||[
        "ORGANIZATION_SESSION_MISMATCH","STUDENT_RESOURCE_OWNER_REQUIRED",
        "PARENT_STUDENT_RELATION_REQUIRED","TEACHER_STUDENT_ASSIGNMENT_REQUIRED",
        "STUDENT_ROLE_DENIED","STUDENT_DATA_POLICY_DENIED","ACTOR_INACTIVE",
        "TENANT_CONTEXT_REQUIRED","ORGANIZATION_CONTEXT_REQUIRED"
      ].includes(code)?403:400;
    json(res,status,buildApiError(error,correlationId),correlationId);
  }
 });
}
