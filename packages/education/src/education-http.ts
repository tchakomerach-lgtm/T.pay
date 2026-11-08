import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { assertAuthorized } from "../../security/src/authorization.js";
import type { Principal, Permission } from "../../security/src/policy.js";
import { assertSessionActive, assertSessionOrganization, type OrganizationSession } from "../../security/src/session.js";
import { authorizeRoute } from "../../api-gateway/src/policy.js";
import { buildApiError, buildApiSuccess } from "../../api-gateway/src/api-contract.js";
import { canonicalRequestHash, newCorrelationId, ApiGatewayRepository, type ApiDb } from "../../api-gateway/src/repository.js";
import { PostgresEducationSyncStore, type PostgresTransactionClient } from "./postgres-sync-fabric.js";
import { PostgresSchoolMutationUnitOfWork } from "./postgres-school-mutation-uow.js";
import { computeSyncPayloadHash } from "./sync-fabric.js";
import { SchoolRealtimeHub, toSseMessage, type SchoolRealtimeEvent } from "./school-realtime.js";
import { PostgresSchoolRealtimeStore } from "./postgres-realtime-store.js";
import type { SchoolRealtimeMessage } from "./school-realtime.js";
import { reconcileAttendance, claimWorkItem, resolveWorkItem, type AttendanceRecord, type WorkItem } from "./school-operations.js";
import { assignService, transitionService, type ActorRef, type ServiceRequest } from "./actor-services.js";
import { validateAssessmentInput, validateGradeInput } from "./gradebook.js";

export interface SchoolAuthContext { principal: Principal; session: OrganizationSession; tenantId: string; }
export interface SchoolApiDependencies {
  db: ApiDb & { query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[];rowCount:number|null}> };
  authenticate(request: IncomingMessage): Promise<SchoolAuthContext>;
  syncClient(): ConstructorParameters<typeof PostgresEducationSyncStore>[0] | Promise<ConstructorParameters<typeof PostgresEducationSyncStore>[0]>;
  mutationClient?: () => PostgresTransactionClient | Promise<PostgresTransactionClient>;
  now?: () => Date;
  realtime?: SchoolRealtimeHub;
  realtimeStore?: Pick<PostgresSchoolRealtimeStore,"replay"|"append"> & Partial<Pick<PostgresSchoolRealtimeStore,"getById">>;
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
 if(parts[0]!=="v1"||parts[1]!=="education")return null;
 if(parts[2]==="actors"&&parts.length===4&&parts[3])return ["actor",parts[3]] as const;
 if(parts[2]==="classes"&&parts.length===3)return ["classes"] as const;
 if(parts[2]==="assessments"&&parts.length===3)return ["assessments"] as const;
 if(parts[2]==="assessments"&&parts.length===4&&parts[3])return ["assessment-lock",parts[3]] as const;
 if(parts[2]==="assessments"&&parts.length===5&&parts[3]&&parts[4]==="grades")return ["assessment-grades",parts[3]] as const;
 if(parts[2]==="subjects"&&parts.length===3)return ["subjects"] as const;
 if(parts[2]==="subjects"&&parts.length===4&&parts[3])return ["subject",parts[3]] as const;
 if(parts[2]==="class-assignments"&&parts.length===3)return ["class-assignments"] as const;
 if(parts[2]==="class-assignments"&&parts.length===4&&parts[3])return ["class-assignment-revoke",parts[3]] as const;
 if(parts[2]==="enrollments"&&parts.length===3)return ["enrollments"] as const;
 if(parts[2]==="enrollments"&&parts.length===4&&parts[3])return ["enrollment-status",parts[3]] as const;
 if(parts[2]==="sync"&&parts[3]==="events"&&parts.length===4)return ["sync"] as const;
 if(parts[2]==="attendance"&&parts.length===3)return ["attendance"] as const;
 if(parts[2]==="work-items"&&parts.length===3)return ["work-create"] as const;
 if(parts[2]==="work-items"&&parts.length===5&&parts[3]&&(parts[4]==="claim"||parts[4]==="resolve"))return ["work",parts[3],parts[4]] as const;
 if(parts[2]==="service-requests"&&parts.length===3)return ["service-create"] as const;
 if(parts[2]==="service-requests"&&parts.length===5&&parts[3]&&parts[4]==="transition")return ["service-transition",parts[3]] as const;
 if(parts[2]==="events"&&parts[3]==="stream"&&parts.length===4)return ["stream"] as const;
 return null;
}
export function permissionFor(kind:string,method:string):Permission{
 if(kind==="actor"||((kind==="classes"||kind==="enrollments"||kind==="assessments"||kind==="assessment-grades")&&method==="GET"))return "org.read";
 if(kind==="assessments"||kind==="assessment-lock")return "org.manage";
 if(kind==="assessment-grades")return "member.manage";
 if(kind==="subjects"&&method==="GET")return "org.read";
 if(kind==="subjects"||kind==="subject")return "org.manage";
 if(kind==="class-assignments"&&method==="GET")return "org.read";
 if(kind==="classes"||kind==="enrollments"||kind==="enrollment-status"||kind==="class-assignments"||kind==="class-assignment-revoke")return "org.manage";
 return "member.manage";
}

async function executeSchoolMutation<T>(
 deps:SchoolApiDependencies,
 scope:{tenantId:string;organizationId:string;actorId:string;requestId:string;route:string;correlationId:string},
 mutation:(tx:PostgresTransactionClient)=>Promise<{data:T;event:Omit<SchoolRealtimeEvent,"id"|"tenantId"|"organizationId"> & {id?:string}}>
):Promise<T>{
 if(!deps.mutationClient)throw new Error("EDUCATION_TRANSACTIONAL_CLIENT_REQUIRED");
 const client=await deps.mutationClient();
 try{
  const result=await new PostgresSchoolMutationUnitOfWork(client).execute(scope,async tx=>{
   const value=await mutation(tx);
   const response=buildApiSuccess("v1",scope.correlationId,value.data);
   return {...value,responseHash:canonicalRequestHash("RESPONSE",scope.route,JSON.stringify(response))};
  });
  return result.data;
 }finally{client.release?.();}
}


async function executeSchoolRead<T>(deps:SchoolApiDependencies,tenantId:string,organizationId:string,work:(tx:PostgresTransactionClient)=>Promise<T>):Promise<T>{
 if(!deps.mutationClient)throw new Error("EDUCATION_TRANSACTIONAL_CLIENT_REQUIRED");
 const client=await deps.mutationClient();
 try{
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE tpay_school_runtime");
  await client.query("SELECT set_config('tpay.tenant_id',$1,true),set_config('tpay.organization_id',$2,true)",[tenantId,organizationId]);
  const result=await work(client);
  await client.query("COMMIT");
  return result;
 }catch(error){try{await client.query("ROLLBACK");}catch{/* preserve original failure */}throw error;}
 finally{client.release?.();}
}

export interface SchoolApiServerOptions { serverFactory?: (handler:(req:IncomingMessage,res:ServerResponse)=>void) => Server; }

export function createSchoolApiServer(deps:SchoolApiDependencies, options:SchoolApiServerOptions={}){
 const serverFactory=options.serverFactory??((handler)=>(createServer(handler)));
 return serverFactory(async(req,res)=>{
  const correlationId=String(req.headers["x-correlation-id"]??newCorrelationId());
  let reservedRequestId:string|undefined;
  let reservedRoute:string|undefined;
  let reservedOrganizationId:string|undefined;
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
     res.setHeader("access-control-allow-methods","GET,POST,PATCH,OPTIONS");
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
   if(dedupe?.status==="reserved"){reservedRequestId=dedupe.requestId;reservedRoute=path;reservedOrganizationId=organizationId;}
   if(dedupe?.status==="conflict")throw new Error("API_IDEMPOTENCY_CONFLICT");
   if(dedupe?.status==="replay"){res.statusCode=dedupe.statusCode??200;json(res,res.statusCode,{ok:true,replayed:true,requestId:dedupe.requestId},correlationId);return;}
   let data:unknown;
   if(r[0]==="classes"){
    if(method==="GET"){
      const url=new URL(rawUrl,"https://tpay.invalid");
      const academicYear=url.searchParams.get("academicYear");
      if(academicYear && !/^\d{4}-\d{4}$/.test(academicYear))throw new Error("EDUCATION_ACADEMIC_YEAR_INVALID");
      const q=await executeSchoolRead(deps,auth.tenantId,organizationId,tx=>tx.query(
        "SELECT class_id,academic_year,code,name,level,capacity,status,version,created_at,updated_at FROM education_classes WHERE tenant_id=$1 AND organization_id=$2 AND ($3::text IS NULL OR academic_year=$3) ORDER BY academic_year DESC,code ASC",
        [auth.tenantId,organizationId,academicYear]
      ));
      data=q.rows;
    }else if(method==="POST"){
      const input=body as Record<string,unknown>;
      const allowed=["academicYear","code","name","level","capacity"];
      if(Object.keys(input).some(key=>!allowed.includes(key)))throw new Error("EDUCATION_CLASS_FIELDS_NOT_ALLOWED");
      const academicYear=String(input.academicYear??"");
      const code=String(input.code??"").trim();
      const name=String(input.name??"").trim();
      const level=String(input.level??"").trim();
      const capacity=Number(input.capacity);
      if(!/^\d{4}-\d{4}$/.test(academicYear)||Number(academicYear.slice(5))!==Number(academicYear.slice(0,4))+1)throw new Error("EDUCATION_ACADEMIC_YEAR_INVALID");
      if(!/^[A-Za-z0-9._-]{1,32}$/.test(code))throw new Error("EDUCATION_CLASS_CODE_INVALID");
      if(!name||name.length>120||!level||level.length>80)throw new Error("EDUCATION_CLASS_DETAILS_INVALID");
      if(!Number.isSafeInteger(capacity)||capacity<1||capacity>3000)throw new Error("EDUCATION_CLASS_CAPACITY_INVALID");
      const classId=randomUUID();
      data=await executeSchoolMutation(deps,{
        tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,
        requestId:dedupe?.requestId??correlationId,route:path,correlationId
      },async tx=>{
        const q=await tx.query(
          "INSERT INTO education_classes(class_id,tenant_id,organization_id,academic_year,code,name,level,capacity,status,created_by,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9,1,now(),now()) RETURNING class_id,academic_year,code,name,level,capacity,status,version,created_at,updated_at",
          [classId,auth.tenantId,organizationId,academicYear,code,name,level,capacity,auth.principal.userId]
        );
        const row=q.rows[0];if(!row)throw new Error("EDUCATION_CLASS_CREATE_FAILED");
        return {data:row,event:{type:"class.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:classId,version:Number(row.version??1),data:{operation:"POST",route:path,status:row.status??null}}};
      });
    }else throw new Error("EDUCATION_CLASS_METHOD_NOT_ALLOWED");
   } else if(r[0]==="enrollments"){
    if(method==="GET"){
      const url=new URL(rawUrl,"https://tpay.invalid");
      const classId=url.searchParams.get("classId");
      const academicYear=url.searchParams.get("academicYear");
      if(academicYear && !/^\d{4}-\d{4}$/.test(academicYear))throw new Error("EDUCATION_ACADEMIC_YEAR_INVALID");
      const q=await executeSchoolRead(deps,auth.tenantId,organizationId,tx=>tx.query(
        "SELECT e.enrollment_id,e.student_id,e.class_id,e.academic_year,e.status,e.enrolled_at,e.version,c.code AS class_code,c.name AS class_name FROM education_enrollments e JOIN education_classes c ON c.tenant_id=e.tenant_id AND c.organization_id=e.organization_id AND c.class_id=e.class_id AND c.academic_year=e.academic_year WHERE e.tenant_id=$1 AND e.organization_id=$2 AND ($3::text IS NULL OR e.class_id=$3) AND ($4::text IS NULL OR e.academic_year=$4) ORDER BY e.enrolled_at DESC,e.enrollment_id ASC",
        [auth.tenantId,organizationId,classId,academicYear]
      ));
      data=q.rows;
    }else if(method==="POST"){
      const input=body as Record<string,unknown>;
      const allowed=["studentId","classId","academicYear"];
      if(Object.keys(input).some(key=>!allowed.includes(key)))throw new Error("EDUCATION_ENROLLMENT_FIELDS_NOT_ALLOWED");
      const studentId=String(input.studentId??"").trim();
      const classId=String(input.classId??"").trim();
      const academicYear=String(input.academicYear??"");
      const enrolledAt=(deps.now??(()=>new Date()))().toISOString();
      if(!studentId||studentId.length>128||!classId||classId.length>128)throw new Error("EDUCATION_ENROLLMENT_REFERENCE_INVALID");
      if(!/^\d{4}-\d{4}$/.test(academicYear)||Number(academicYear.slice(5))!==Number(academicYear.slice(0,4))+1)throw new Error("EDUCATION_ACADEMIC_YEAR_INVALID");
      if(!Number.isFinite(Date.parse(enrolledAt)))throw new Error("EDUCATION_ENROLLMENT_DATE_INVALID");
      const enrollmentId=randomUUID();
      data=await executeSchoolMutation(deps,{
        tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,
        requestId:dedupe?.requestId??correlationId,route:path,correlationId
      },async tx=>{
        const q=await tx.query(
          "INSERT INTO education_enrollments(enrollment_id,tenant_id,organization_id,student_id,class_id,academic_year,status,enrolled_at,created_by,version) VALUES($1,$2,$3,$4,$5,$6,'ACTIVE',$7,$8,1) RETURNING enrollment_id,student_id,class_id,academic_year,status,enrolled_at,created_by,version",
          [enrollmentId,auth.tenantId,organizationId,studentId,classId,academicYear,enrolledAt,auth.principal.userId]
        );
        const row=q.rows[0];if(!row)throw new Error("EDUCATION_ENROLLMENT_CREATE_FAILED");
        return {data:row,event:{type:"enrollment.changed",occurredAt:enrolledAt,entityId:enrollmentId,version:Number(row.version??1),data:{operation:"POST",route:path,status:row.status??null}}};
      });
    }else throw new Error("EDUCATION_ENROLLMENT_METHOD_NOT_ALLOWED");
   } else if(r[0]==="class-assignments"){
    if(method==="GET"){
      const url=new URL(rawUrl,"https://tpay.invalid");
      const classId=url.searchParams.get("classId");
      const academicYear=url.searchParams.get("academicYear");
      const teacherId=url.searchParams.get("teacherId");
      if(academicYear && !/^\d{4}-\d{4}$/.test(academicYear))throw new Error("EDUCATION_ACADEMIC_YEAR_INVALID");
      const q=await executeSchoolRead(deps,auth.tenantId,organizationId,tx=>tx.query(
        "SELECT assignment_id,class_id,academic_year,teacher_actor_id,subject_code,weekly_hours,valid_from,valid_until,status,version,created_at,updated_at FROM education_class_assignments WHERE tenant_id=$1 AND organization_id=$2 AND ($3::text IS NULL OR class_id=$3) AND ($4::text IS NULL OR academic_year=$4) AND ($5::text IS NULL OR teacher_actor_id=$5) ORDER BY academic_year DESC,class_id,subject_code,teacher_actor_id",
        [auth.tenantId,organizationId,classId,academicYear,teacherId]
      ));
      data=q.rows;
    }else if(method==="POST"){
      const input=body as Record<string,unknown>;
      const allowed=["classId","academicYear","teacherActorId","subjectCode","weeklyHours","validFrom","validUntil"];
      if(Object.keys(input).some(key=>!allowed.includes(key)))throw new Error("EDUCATION_ASSIGNMENT_FIELDS_NOT_ALLOWED");
      const classId=String(input.classId??"").trim();
      const academicYear=String(input.academicYear??"");
      const teacherActorId=String(input.teacherActorId??"").trim();
      const subjectCode=String(input.subjectCode??"").trim();
      const weeklyHours=Number(input.weeklyHours);
      const validFrom=String(input.validFrom??"");
      const validUntil=input.validUntil===null||input.validUntil===undefined||input.validUntil===""?null:String(input.validUntil);
      if(!classId||classId.length>128||!teacherActorId||teacherActorId.length>128)throw new Error("EDUCATION_ASSIGNMENT_REFERENCE_INVALID");
      if(!/^\d{4}-\d{4}$/.test(academicYear)||Number(academicYear.slice(5))!==Number(academicYear.slice(0,4))+1)throw new Error("EDUCATION_ACADEMIC_YEAR_INVALID");
      if(!/^[A-Za-z0-9._-]{1,32}$/.test(subjectCode))throw new Error("EDUCATION_SUBJECT_CODE_INVALID");
      if(!Number.isFinite(weeklyHours)||weeklyHours<=0||weeklyHours>60)throw new Error("EDUCATION_WEEKLY_HOURS_INVALID");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)||Number.isNaN(Date.parse(validFrom+"T00:00:00Z")))throw new Error("EDUCATION_ASSIGNMENT_START_DATE_INVALID");
      if(validUntil!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)||Number.isNaN(Date.parse(validUntil+"T00:00:00Z"))||validUntil<validFrom))throw new Error("EDUCATION_ASSIGNMENT_END_DATE_INVALID");
      const assignmentId=randomUUID();
      data=await executeSchoolMutation(deps,{
        tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,
        requestId:dedupe?.requestId??correlationId,route:path,correlationId
      },async tx=>{
        const teacher=await tx.query(
          "SELECT actor_id FROM education_actors WHERE tenant_id=$1 AND organization_id=$2 AND actor_id=$3 AND kind='TEACHER' AND active=true",
          [auth.tenantId,organizationId,teacherActorId]
        );
        if(!teacher.rows[0])throw new Error("EDUCATION_ACTIVE_TEACHER_NOT_FOUND");
        const subject=await tx.query("SELECT subject_code FROM education_subjects WHERE tenant_id=$1 AND organization_id=$2 AND subject_code=$3 AND active=true",[auth.tenantId,organizationId,subjectCode]);
        if(!subject.rows[0])throw new Error("EDUCATION_ACTIVE_SUBJECT_NOT_FOUND");
        const saved=await tx.query(
          "INSERT INTO education_class_assignments(assignment_id,tenant_id,organization_id,class_id,academic_year,teacher_actor_id,subject_code,weekly_hours,valid_from,valid_until,status,created_by,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10::date,'ACTIVE',$11,1) RETURNING assignment_id,class_id,academic_year,teacher_actor_id,subject_code,weekly_hours,valid_from,valid_until,status,version,created_at,updated_at",
          [assignmentId,auth.tenantId,organizationId,classId,academicYear,teacherActorId,subjectCode,weeklyHours,validFrom,validUntil,auth.principal.userId]
        );
        const row=saved.rows[0];if(!row)throw new Error("EDUCATION_ASSIGNMENT_CREATE_FAILED");
        return {data:row,event:{type:"class_assignment.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:assignmentId,version:Number(row.version??1),data:{operation:"POST",status:row.status,subjectCode}}};
      });
    }else throw new Error("EDUCATION_ASSIGNMENT_METHOD_NOT_ALLOWED");
   } else if(r[0]==="class-assignment-revoke"){
    if(method!=="PATCH")throw new Error("EDUCATION_ASSIGNMENT_METHOD_NOT_ALLOWED");
    const input=body as Record<string,unknown>;
    if(Object.keys(input).some(key=>!["expectedVersion","reason"].includes(key)))throw new Error("EDUCATION_ASSIGNMENT_REVOCATION_FIELDS_NOT_ALLOWED");
    const expectedVersion=Number(input.expectedVersion);
    const reason=String(input.reason??"").trim();
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw new Error("EDUCATION_ASSIGNMENT_VERSION_REQUIRED");
    if(!reason||reason.length>500)throw new Error("EDUCATION_ASSIGNMENT_REVOCATION_REASON_REQUIRED");
    data=await executeSchoolMutation(deps,{
      tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,
      requestId:dedupe?.requestId??correlationId,route:path,correlationId
    },async tx=>{
      const updated=await tx.query(
        "UPDATE education_class_assignments SET status='REVOKED',revoked_by=$1,revocation_reason=$2,version=version+1,updated_at=now() WHERE tenant_id=$3 AND organization_id=$4 AND assignment_id=$5::uuid AND status='ACTIVE' AND version=$6 RETURNING assignment_id,class_id,academic_year,teacher_actor_id,subject_code,status,revoked_by,revocation_reason,version,updated_at",
        [auth.principal.userId,reason,auth.tenantId,organizationId,r[1],expectedVersion]
      );
      if(!updated.rows[0]){
        const current=await tx.query("SELECT status,version FROM education_class_assignments WHERE tenant_id=$1 AND organization_id=$2 AND assignment_id=$3::uuid",[auth.tenantId,organizationId,r[1]]);
        if(!current.rows[0])throw new Error("EDUCATION_ASSIGNMENT_NOT_FOUND");
        throw new Error("EDUCATION_ASSIGNMENT_STATE_OR_VERSION_CONFLICT");
      }
      const row=updated.rows[0];
      return {data:row,event:{type:"class_assignment.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:String(row.assignment_id),version:Number(row.version??1),data:{operation:"PATCH",status:row.status,reason}}};
    });
   } else if(r[0]==="enrollment-status"){
    if(method!=="PATCH")throw new Error("EDUCATION_ENROLLMENT_METHOD_NOT_ALLOWED");
    const input=body as Record<string,unknown>;
    if(Object.keys(input).some(key=>!["status","expectedVersion"].includes(key)))throw new Error("EDUCATION_ENROLLMENT_STATUS_FIELDS_NOT_ALLOWED");
    const nextStatus=String(input.status??"");
    const expectedVersion=Number(input.expectedVersion);
    if(!["WITHDRAWN","CANCELLED","COMPLETED"].includes(nextStatus))throw new Error("EDUCATION_ENROLLMENT_TRANSITION_INVALID");
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw new Error("EDUCATION_ENROLLMENT_VERSION_REQUIRED");
    data=await executeSchoolMutation(deps,{
        tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,
        requestId:dedupe?.requestId??correlationId,route:path,correlationId
      },async tx=>{
      const updated=await tx.query(
        "UPDATE education_enrollments SET status=$1,version=version+1,updated_at=now() WHERE tenant_id=$2 AND organization_id=$3 AND enrollment_id=$4 AND status='ACTIVE' AND version=$5 RETURNING enrollment_id,student_id,class_id,academic_year,status,enrolled_at,version,updated_at",
        [nextStatus,auth.tenantId,organizationId,r[1],expectedVersion]
      );
      if(!updated.rows[0]){
        const current=await tx.query(
          "SELECT status,version FROM education_enrollments WHERE tenant_id=$1 AND organization_id=$2 AND enrollment_id=$3",
          [auth.tenantId,organizationId,r[1]]
        );
        if(!current.rows[0])throw new Error("EDUCATION_ENROLLMENT_NOT_FOUND");
        throw new Error("EDUCATION_ENROLLMENT_STATE_OR_VERSION_CONFLICT");
      }
      const row=updated.rows[0];
      return {data:row,event:{type:"enrollment.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:String(row.enrollment_id),version:Number(row.version??1),data:{operation:"PATCH",route:path,status:row.status??null}}};
    });
   } else if(r[0]==="actor"){
    const q=await executeSchoolRead(deps,auth.tenantId,organizationId,tx=>tx.query("SELECT actor_id,organization_id,kind,active,data,version,updated_at FROM education_actors WHERE tenant_id=$1 AND organization_id=$2 AND actor_id=$3",[auth.tenantId,organizationId,r[1]]));
    if(!q.rows[0]){res.statusCode=404;json(res,404,buildApiError(new Error("ACTOR_NOT_FOUND"),correlationId),correlationId);return;}
    data=q.rows[0];
   } else if(r[0]==="sync"){
    const event={...body,tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,payloadHash:computeSyncPayloadHash((body as any).payload)};
    const syncClient=await deps.syncClient();
    try{ data=await new PostgresEducationSyncStore(syncClient).accept(event as any); }
    finally{ syncClient.release?.(); }
   } else if(r[0]==="subjects"){
    if(method==="GET"){
      const url=new URL(rawUrl,"https://tpay.invalid");
      const activeParam=url.searchParams.get("active");
      if(activeParam!==null&&activeParam!=="true"&&activeParam!=="false")throw new Error("EDUCATION_SUBJECT_ACTIVE_FILTER_INVALID");
      const active=activeParam===null?null:activeParam==="true";
      const q=await executeSchoolRead(deps,auth.tenantId,organizationId,tx=>tx.query(
        "SELECT subject_id,subject_code,name,description,coefficient,active,version,created_at,updated_at FROM education_subjects WHERE tenant_id=$1 AND organization_id=$2 AND ($3::boolean IS NULL OR active=$3) ORDER BY subject_code ASC",
        [auth.tenantId,organizationId,active]
      ));
      data=q.rows;
    }else if(method==="POST"){
      const input=body as Record<string,unknown>;
      const allowed=["subjectCode","name","description","coefficient"];
      if(Object.keys(input).some(key=>!allowed.includes(key)))throw new Error("EDUCATION_SUBJECT_FIELDS_NOT_ALLOWED");
      const subjectCode=String(input.subjectCode??"").trim().toUpperCase();
      const name=String(input.name??"").trim();
      const description=input.description===undefined||input.description===null?"":String(input.description).trim();
      const coefficient=input.coefficient===undefined?1:Number(input.coefficient);
      if(!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(subjectCode))throw new Error("EDUCATION_SUBJECT_CODE_INVALID");
      if(!name||name.length>120)throw new Error("EDUCATION_SUBJECT_NAME_INVALID");
      if(description.length>1000)throw new Error("EDUCATION_SUBJECT_DESCRIPTION_INVALID");
      if(!Number.isFinite(coefficient)||coefficient<=0||coefficient>100)throw new Error("EDUCATION_SUBJECT_COEFFICIENT_INVALID");
      data=await executeSchoolMutation(deps,{tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,requestId:dedupe?.requestId??correlationId,route:path,correlationId},async tx=>{
        const saved=await tx.query(
          "INSERT INTO education_subjects(tenant_id,organization_id,subject_code,name,description,coefficient,active,created_by) VALUES($1,$2,$3,$4,$5,$6,true,$7) RETURNING subject_id,subject_code,name,description,coefficient,active,version,created_at,updated_at",
          [auth.tenantId,organizationId,subjectCode,name,description||null,coefficient,auth.principal.userId]
        );
        const row=saved.rows[0];if(!row)throw new Error("EDUCATION_SUBJECT_CREATE_FAILED");
        return {data:row,event:{type:"subject.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:String(row.subject_id),version:Number(row.version),data:{operation:"POST",subjectCode,active:true}}};
      });
    }else throw new Error("EDUCATION_SUBJECT_METHOD_NOT_ALLOWED");
   } else if(r[0]==="subject"){
    if(method!=="PATCH")throw new Error("EDUCATION_SUBJECT_METHOD_NOT_ALLOWED");
    const input=body as Record<string,unknown>;
    const allowed=["name","description","coefficient","active","expectedVersion"];
    if(Object.keys(input).some(key=>!allowed.includes(key)))throw new Error("EDUCATION_SUBJECT_FIELDS_NOT_ALLOWED");
    const expectedVersion=Number(input.expectedVersion);
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw new Error("EDUCATION_SUBJECT_VERSION_REQUIRED");
    const name=input.name===undefined?null:String(input.name).trim();
    const description=input.description===undefined?null:(input.description===null?"":String(input.description).trim());
    const coefficient=input.coefficient===undefined?null:Number(input.coefficient);
    const active=input.active===undefined?null:input.active;
    if(name!==null&&(!name||name.length>120))throw new Error("EDUCATION_SUBJECT_NAME_INVALID");
    if(description!==null&&description.length>1000)throw new Error("EDUCATION_SUBJECT_DESCRIPTION_INVALID");
    if(coefficient!==null&&(!Number.isFinite(coefficient)||coefficient<=0||coefficient>100))throw new Error("EDUCATION_SUBJECT_COEFFICIENT_INVALID");
    if(active!==null&&typeof active!=="boolean")throw new Error("EDUCATION_SUBJECT_ACTIVE_INVALID");
    if(name===null&&description===null&&coefficient===null&&active===null)throw new Error("EDUCATION_SUBJECT_UPDATE_EMPTY");
    data=await executeSchoolMutation(deps,{tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,requestId:dedupe?.requestId??correlationId,route:path,correlationId},async tx=>{
      const saved=await tx.query(
        "UPDATE education_subjects SET name=COALESCE($1,name),description=CASE WHEN $2::boolean THEN $3 ELSE description END,coefficient=COALESCE($4,coefficient),active=COALESCE($5,active),version=version+1,updated_at=now() WHERE tenant_id=$6 AND organization_id=$7 AND subject_code=$8 AND version=$9 RETURNING subject_id,subject_code,name,description,coefficient,active,version,created_at,updated_at",
        [name,description!==null,description,coefficient,active,auth.tenantId,organizationId,r[1],expectedVersion]
      );
      const row=saved.rows[0];if(!row)throw new Error("EDUCATION_SUBJECT_VERSION_CONFLICT");
      return {data:row,event:{type:"subject.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:String(row.subject_id),version:Number(row.version),data:{operation:"PATCH",subjectCode:row.subject_code,active:row.active}}};
    });
   } else if(r[0]==="assessments"){
    if(method==="GET"){
      const url=new URL(rawUrl,"https://tpay.invalid");
      const classId=url.searchParams.get("classId");
      const academicYear=url.searchParams.get("academicYear");
      const subjectCode=url.searchParams.get("subjectCode");
      if(academicYear&&(!/^\\d{4}-\\d{4}$/.test(academicYear)||Number(academicYear.slice(5))!==Number(academicYear.slice(0,4))+1))throw new Error("EDUCATION_ACADEMIC_YEAR_INVALID");
      const q=await executeSchoolRead(deps,auth.tenantId,organizationId,tx=>tx.query(
        "SELECT assessment_id,class_id,academic_year,subject_code,period_code,title,assessment_date,max_score,coefficient,status,version,created_by,locked_by,locked_at,created_at,updated_at FROM education_assessments WHERE tenant_id=$1 AND organization_id=$2 AND ($3::text IS NULL OR class_id=$3) AND ($4::text IS NULL OR academic_year=$4) AND ($5::text IS NULL OR subject_code=$5) ORDER BY assessment_date DESC,created_at DESC",
        [auth.tenantId,organizationId,classId,academicYear,subjectCode]
      ));
      data=q.rows;
    }else if(method==="POST"){
      const input=body as Record<string,unknown>;
      const allowed=["classId","academicYear","subjectCode","periodCode","title","assessmentDate","maxScore","coefficient"];
      if(Object.keys(input).some(key=>!allowed.includes(key)))throw new Error("EDUCATION_ASSESSMENT_FIELDS_NOT_ALLOWED");
      const assessment=validateAssessmentInput({
        classId:String(input.classId??""),academicYear:String(input.academicYear??""),
        subjectCode:String(input.subjectCode??""),periodCode:String(input.periodCode??""),
        title:String(input.title??""),assessmentDate:String(input.assessmentDate??""),
        maxScore:Number(input.maxScore),coefficient:input.coefficient===undefined?1:Number(input.coefficient)
      });
      const assessmentId=randomUUID();
      data=await executeSchoolMutation(deps,{tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,requestId:dedupe?.requestId??correlationId,route:path,correlationId},async tx=>{
        const refs=await tx.query(
          "SELECT c.class_id,s.subject_code FROM education_classes c JOIN education_subjects s ON s.tenant_id=c.tenant_id AND s.organization_id=c.organization_id WHERE c.tenant_id=$1 AND c.organization_id=$2 AND c.class_id=$3 AND c.academic_year=$4 AND c.status='ACTIVE' AND s.subject_code=$5 AND s.active=true",
          [auth.tenantId,organizationId,assessment.classId,assessment.academicYear,assessment.subjectCode]
        );
        if(!refs.rows[0])throw new Error("EDUCATION_ASSESSMENT_CLASS_OR_SUBJECT_NOT_FOUND");
        const saved=await tx.query(
          "INSERT INTO education_assessments(assessment_id,tenant_id,organization_id,class_id,academic_year,subject_code,period_code,title,assessment_date,max_score,coefficient,status,created_by,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11,'OPEN',$12,1) RETURNING assessment_id,class_id,academic_year,subject_code,period_code,title,assessment_date,max_score,coefficient,status,version,created_by,created_at,updated_at",
          [assessmentId,auth.tenantId,organizationId,assessment.classId,assessment.academicYear,assessment.subjectCode,assessment.periodCode,assessment.title,assessment.assessmentDate,assessment.maxScore,assessment.coefficient,auth.principal.userId]
        );
        const row=saved.rows[0];if(!row)throw new Error("EDUCATION_ASSESSMENT_CREATE_FAILED");
        return {data:row,event:{type:"assessment.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:assessmentId,version:Number(row.version??1),data:{operation:"POST",status:"OPEN",subjectCode:assessment.subjectCode}}};
      });
    }else throw new Error("EDUCATION_ASSESSMENT_METHOD_NOT_ALLOWED");
   } else if(r[0]==="assessment-lock"){
    if(method!=="PATCH")throw new Error("EDUCATION_ASSESSMENT_METHOD_NOT_ALLOWED");
    const input=body as Record<string,unknown>;
    if(Object.keys(input).some(key=>key!=="expectedVersion"))throw new Error("EDUCATION_ASSESSMENT_LOCK_FIELDS_NOT_ALLOWED");
    const expectedVersion=Number(input.expectedVersion);
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw new Error("EDUCATION_ASSESSMENT_VERSION_REQUIRED");
    data=await executeSchoolMutation(deps,{tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,requestId:dedupe?.requestId??correlationId,route:path,correlationId},async tx=>{
      const saved=await tx.query(
        "UPDATE education_assessments SET status='LOCKED',locked_by=$1,locked_at=now(),version=version+1,updated_at=now() WHERE tenant_id=$2 AND organization_id=$3 AND assessment_id=$4::uuid AND status='OPEN' AND version=$5 RETURNING assessment_id,status,version,locked_by,locked_at,updated_at",
        [auth.principal.userId,auth.tenantId,organizationId,r[1],expectedVersion]
      );
      if(!saved.rows[0])throw new Error("EDUCATION_ASSESSMENT_STATE_OR_VERSION_CONFLICT");
      const row=saved.rows[0];
      return {data:row,event:{type:"assessment.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:String(row.assessment_id),version:Number(row.version),data:{operation:"PATCH",status:"LOCKED"}}};
    });
   } else if(r[0]==="assessment-grades"){
    if(method==="GET"){
      const q=await executeSchoolRead(deps,auth.tenantId,organizationId,tx=>tx.query(
        "SELECT g.grade_id,g.assessment_id,g.enrollment_id,e.student_id,e.class_id,g.score,g.teacher_comment,g.version,g.entered_by,g.created_at,g.updated_at FROM education_grades g JOIN education_enrollments e ON e.tenant_id=g.tenant_id AND e.organization_id=g.organization_id AND e.enrollment_id=g.enrollment_id WHERE g.tenant_id=$1 AND g.organization_id=$2 AND g.assessment_id=$3::uuid ORDER BY e.student_id",
        [auth.tenantId,organizationId,r[1]]
      ));
      data=q.rows;
    }else if(method==="POST"){
      const input=body as Record<string,unknown>;
      const allowed=["enrollmentId","score","teacherComment","expectedVersion"];
      if(Object.keys(input).some(key=>!allowed.includes(key)))throw new Error("EDUCATION_GRADE_FIELDS_NOT_ALLOWED");
      const grade=validateGradeInput({
        enrollmentId:String(input.enrollmentId??""),score:Number(input.score),
        teacherComment:input.teacherComment===undefined||input.teacherComment===null?null:String(input.teacherComment),
        ...(input.expectedVersion===undefined?{}:{expectedVersion:Number(input.expectedVersion)})
      },1000);
      data=await executeSchoolMutation(deps,{tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,requestId:dedupe?.requestId??correlationId,route:path,correlationId},async tx=>{
        const assessment=await tx.query(
          "SELECT assessment_id,class_id,academic_year,subject_code,max_score,status FROM education_assessments WHERE tenant_id=$1 AND organization_id=$2 AND assessment_id=$3::uuid FOR UPDATE",
          [auth.tenantId,organizationId,r[1]]
        );
        const a=assessment.rows[0];if(!a)throw new Error("EDUCATION_ASSESSMENT_NOT_FOUND");
        if(a.status!=="OPEN")throw new Error("EDUCATION_ASSESSMENT_LOCKED");
        const maxScore=Number(a.max_score);
        validateGradeInput(grade,maxScore);
        const enrollment=await tx.query(
          "SELECT enrollment_id FROM education_enrollments WHERE tenant_id=$1 AND organization_id=$2 AND enrollment_id=$3 AND class_id=$4 AND academic_year=$5 AND status='ACTIVE'",
          [auth.tenantId,organizationId,grade.enrollmentId,a.class_id,a.academic_year]
        );
        if(!enrollment.rows[0])throw new Error("EDUCATION_GRADE_ACTIVE_ENROLLMENT_REQUIRED");
        if(!auth.principal.permissions.includes("org.manage")){
          const assignment=await tx.query(
            "SELECT assignment_id FROM education_class_assignments WHERE tenant_id=$1 AND organization_id=$2 AND class_id=$3 AND academic_year=$4 AND teacher_actor_id=$5 AND subject_code=$6 AND status='ACTIVE' AND valid_from<=CURRENT_DATE AND (valid_until IS NULL OR valid_until>=CURRENT_DATE)",
            [auth.tenantId,organizationId,a.class_id,a.academic_year,auth.principal.userId,a.subject_code]
          );
          if(!assignment.rows[0])throw new Error("EDUCATION_GRADE_TEACHING_ASSIGNMENT_REQUIRED");
        }
        const current=await tx.query(
          "SELECT grade_id,version FROM education_grades WHERE tenant_id=$1 AND organization_id=$2 AND assessment_id=$3::uuid AND enrollment_id=$4 FOR UPDATE",
          [auth.tenantId,organizationId,r[1],grade.enrollmentId]
        );
        let saved:{rows:Record<string,unknown>[];rowCount:number|null};
        if(current.rows[0]){
          if(grade.expectedVersion!==Number(current.rows[0].version))throw new Error("EDUCATION_GRADE_VERSION_CONFLICT");
          saved=await tx.query(
            "UPDATE education_grades SET score=$1,teacher_comment=$2,entered_by=$3,version=version+1,updated_at=now() WHERE tenant_id=$4 AND organization_id=$5 AND assessment_id=$6::uuid AND enrollment_id=$7 AND version=$8 RETURNING grade_id,assessment_id,enrollment_id,score,teacher_comment,version,entered_by,created_at,updated_at",
            [grade.score,grade.teacherComment??null,auth.principal.userId,auth.tenantId,organizationId,r[1],grade.enrollmentId,grade.expectedVersion]
          );
        }else{
          if(grade.expectedVersion!==undefined)throw new Error("EDUCATION_GRADE_VERSION_CONFLICT");
          saved=await tx.query(
            "INSERT INTO education_grades(grade_id,tenant_id,organization_id,assessment_id,enrollment_id,score,teacher_comment,version,entered_by) VALUES($1,$2,$3,$4::uuid,$5,$6,$7,1,$8) RETURNING grade_id,assessment_id,enrollment_id,score,teacher_comment,version,entered_by,created_at,updated_at",
            [randomUUID(),auth.tenantId,organizationId,r[1],grade.enrollmentId,grade.score,grade.teacherComment??null,auth.principal.userId]
          );
        }
        const row=saved.rows[0];if(!row)throw new Error("EDUCATION_GRADE_VERSION_CONFLICT");
        return {data:row,event:{type:"grade.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:String(row.grade_id),version:Number(row.version??1),data:{operation:"UPSERT",assessmentId:r[1],enrollmentId:grade.enrollmentId}}};
      });
    }else throw new Error("EDUCATION_GRADE_METHOD_NOT_ALLOWED");
   } else if(r[0]==="attendance"){
    const incoming=body as AttendanceRecord; incoming.organizationId=organizationId;
    data=await executeSchoolMutation(deps,{tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,requestId:dedupe?.requestId??correlationId,route:path,correlationId},async tx=>{
      const q=await tx.query("SELECT * FROM education_attendance WHERE tenant_id=$1 AND organization_id=$2 AND student_id=$3 AND class_id=$4",[auth.tenantId,organizationId,incoming.studentId,incoming.classId]);
      const existing=(q.rows[0]??null) as AttendanceRecord|null;
      const accepted=reconcileAttendance(existing,incoming);
      const saved=await tx.query("INSERT INTO education_attendance(student_id,class_id,tenant_id,organization_id,status,recorded_by,occurred_at,source,correction_reason,version,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT(tenant_id,organization_id,student_id,class_id) DO UPDATE SET status=EXCLUDED.status,recorded_by=EXCLUDED.recorded_by,occurred_at=EXCLUDED.occurred_at,source=EXCLUDED.source,correction_reason=EXCLUDED.correction_reason,version=EXCLUDED.version,updated_at=now() WHERE education_attendance.version < EXCLUDED.version RETURNING student_id,class_id,status,recorded_by,occurred_at,source,correction_reason,version,updated_at",[accepted.studentId,accepted.classId,auth.tenantId,organizationId,accepted.status,accepted.recordedBy,accepted.occurredAt,accepted.source,accepted.correctionReason??null,accepted.version]);
      const row=saved.rows[0];if(!row)throw new Error("ATTENDANCE_VERSION_CONFLICT");
      return {data:row,event:{type:"attendance.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:String(row.student_id)+":"+String(row.class_id),version:Number(row.version),data:{status:row.status,source:row.source}}};
    });
   } else if(r[0]==="work-create"){
    const item=body as WorkItem;if(item.organizationId!==organizationId)throw new Error("RESOURCE_ORGANIZATION_MISMATCH");
    data=await executeSchoolMutation(deps,{tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,requestId:dedupe?.requestId??correlationId,route:path,correlationId},async tx=>{
      const saved=await tx.query("INSERT INTO education_work_items(work_item_id,tenant_id,organization_id,status,priority,due_at,owner_actor_id,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[item.id,auth.tenantId,organizationId,item.status,item.priority,item.dueAt,item.ownerActorId,item.version]);
      const row=saved.rows[0];if(!row)throw new Error("WORK_ITEM_CREATE_FAILED");
      return {data:row,event:{type:"work_item.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:String(row.work_item_id),version:Number(row.version),data:{operation:"POST",status:row.status}}};
    });
   } else if(r[0]==="work"){
    data=await executeSchoolMutation(deps,{tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,requestId:dedupe?.requestId??correlationId,route:path,correlationId},async tx=>{
      const q=await tx.query("SELECT * FROM education_work_items WHERE tenant_id=$1 AND organization_id=$2 AND work_item_id=$3",[auth.tenantId,organizationId,r[1]]);
      if(!q.rows[0])throw new Error("WORK_ITEM_NOT_FOUND");const item=q.rows[0] as unknown as WorkItem;
      const next=r[2]==="claim"?claimWorkItem(item,auth.principal.userId):resolveWorkItem(item,auth.principal.userId);
      const updated=await tx.query("UPDATE education_work_items SET status=$1,owner_actor_id=$2,version=$3,updated_at=now() WHERE tenant_id=$4 AND organization_id=$5 AND work_item_id=$6 AND version=$7 RETURNING *",[next.status,next.ownerActorId,next.version,auth.tenantId,organizationId,r[1],item.version]);
      const row=updated.rows[0];if(!row)throw new Error("CONCURRENT_MODIFICATION");
      return {data:row,event:{type:"work_item.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:String(row.work_item_id),version:Number(row.version),data:{operation:r[2],status:row.status}}};
    });
   } else if(r[0]==="service-create"){
    const item={...(body as ServiceRequest),organizationId,requesterId:auth.principal.userId};
    data=await executeSchoolMutation(deps,{tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,requestId:dedupe?.requestId??correlationId,route:path,correlationId},async tx=>{
      const saved=await tx.query("INSERT INTO education_service_requests(request_id,tenant_id,organization_id,requester_id,service_code,status,priority,assigned_to,created_at,due_at,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",[item.id,auth.tenantId,organizationId,item.requesterId,item.serviceCode,item.status,item.priority,item.assignedTo,item.createdAt,item.dueAt,item.version]);
      const row=saved.rows[0];if(!row)throw new Error("SERVICE_REQUEST_CREATE_FAILED");
      return {data:row,event:{type:"service_request.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:String(row.request_id),version:Number(row.version),data:{operation:"POST",status:row.status}}};
    });
   } else {
    data=await executeSchoolMutation(deps,{tenantId:auth.tenantId,organizationId,actorId:auth.principal.userId,requestId:dedupe?.requestId??correlationId,route:path,correlationId},async tx=>{
      const q=await tx.query("SELECT * FROM education_service_requests WHERE tenant_id=$1 AND organization_id=$2 AND request_id=$3",[auth.tenantId,organizationId,r[1]]);
      if(!q.rows[0])throw new Error("SERVICE_REQUEST_NOT_FOUND");const current=q.rows[0] as unknown as ServiceRequest;
      const next=transitionService(current,body as any);
      const updated=await tx.query("UPDATE education_service_requests SET status=$1,version=$2,updated_at=now() WHERE tenant_id=$3 AND organization_id=$4 AND request_id=$5 AND version=$6 RETURNING *",[next.status,next.version,auth.tenantId,organizationId,r[1],Number(current.version)]);
      const row=updated.rows[0];if(!row)throw new Error("CONCURRENT_MODIFICATION");
      return {data:row,event:{type:"service_request.changed",occurredAt:(deps.now??(()=>new Date()))().toISOString(),entityId:String(row.request_id),version:Number(row.version),data:{operation:"TRANSITION",status:row.status}}};
    });
   }

   if(r[0]==="sync" && deps.realtime && deps.realtimeStore?.getById){
    const eventId=String((data as any)?.eventId??"");
    if(eventId){
      const stored=await deps.realtimeStore.getById(auth.tenantId,organizationId,eventId);
      if(stored)deps.realtime.publish(stored);
    }
   }
   const transactionalSchoolWrite=method!=="GET" && ["classes","subjects","subject","enrollments","enrollment-status","class-assignments","class-assignment-revoke","attendance","work-create","work","service-create","service-transition"].includes(r[0]);
   if(deps.realtime && deps.realtimeStore && method!=="GET" && r[0]!=="actor" && r[0]!=="sync" && !transactionalSchoolWrite){
    const typeMap:Record<string,SchoolRealtimeEvent["type"]>={classes:"class.changed",subjects:"subject.changed",subject:"subject.changed",enrollments:"enrollment.changed","enrollment-status":"enrollment.changed","class-assignments":"class_assignment.changed","class-assignment-revoke":"class_assignment.changed",sync:"sync.accepted",attendance:"attendance.changed","work-create":"work_item.changed",work:"work_item.changed","service-create":"service_request.changed","service-transition":"service_request.changed"};
    const eventType=typeMap[r[0]];
    if(eventType){
      const event:SchoolRealtimeEvent={
        id:correlationId,
        tenantId:auth.tenantId,
        organizationId,
        type:eventType,
        occurredAt:(deps.now??(()=>new Date()))().toISOString(),
        entityId:String((data as any)?.class_id??(data as any)?.enrollment_id??(data as any)?.id??(data as any)?.request_id??(data as any)?.work_item_id??(data as any)?.eventId??correlationId),
        version:Number((data as any)?.version??1),
        data:{operation:method,route:path,status:(data as any)?.status??null}
      };
      const streamSequence=await deps.realtimeStore.append(event);
      event.streamSequence=streamSequence.toString();
      deps.realtime.publish(event);
    }
   }
   const response=buildApiSuccess("v1",correlationId,data);
   if(dedupe?.status==="reserved" && !transactionalSchoolWrite)await gateway.completeIdempotency({requestId:dedupe.requestId,state:"succeeded",responseHash:canonicalRequestHash("RESPONSE",path,JSON.stringify(response)),statusCode:200});
   if(!transactionalSchoolWrite)await gateway.audit({organizationId,requestId:dedupe?.requestId??correlationId,route:path,actorId:auth.principal.userId,authClass:"member",outcome:"accepted",correlationId,metadata:JSON.stringify({method,path})});
   json(res,200,response,correlationId);
  }catch(error){
    const code=String(error);
    const status=code.includes("FORBIDDEN")?403:
      code.includes("NOT_FOUND")?404:
      code.includes("CONFLICT")?409:
      code.includes("INVALID")||code.includes("REQUIRED")||code.includes("NOT_ALLOWED")||code.includes("METHOD_NOT_ALLOWED")?400:500;
    const errorBody=buildApiError(error,correlationId);
    if(reservedRequestId&&reservedRoute&&reservedOrganizationId){
      try{
        await deps.db.query(
          "UPDATE api_request_deduplication SET state='failed',response_hash=$2,status_code=$3 WHERE id=$1 AND organization_id=$4 AND state='reserved'",
          [reservedRequestId,canonicalRequestHash("RESPONSE",reservedRoute,JSON.stringify(errorBody)),status,reservedOrganizationId]
        );
      }catch{/* never hide the original API failure */}
    }
    json(res,status,errorBody,correlationId);
  }
 });
}
