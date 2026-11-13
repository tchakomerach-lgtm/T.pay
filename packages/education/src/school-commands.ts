import { createHash, randomUUID } from "node:crypto";
import type { PostgresTransactionClient } from "./postgres-sync-fabric.js";

export interface SchoolCommandContext {
  tenantId: string;
  organizationId: string;
  actorId: string;
}
export interface SchoolCommandResult<T=Record<string,unknown>> {
  replayed: boolean;
  commandId: string;
  data: T;
}
type CommandAction<T> = (client:PostgresTransactionClient,commandId:string)=>Promise<{resourceId:string;data:T}>;
const SHA256=/^[a-f0-9]{64}$/;
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value),"utf8").digest("hex");
const required=(value:unknown,code:string,max=160):string=>{
  if(typeof value!=="string"||!value.trim()||value.trim().length>max)throw new Error(code);
  return value.trim();
};
const academicYear=(value:unknown):string=>{
  const year=required(value,"ACADEMIC_YEAR_REQUIRED",9);
  if(!/^\d{4}[-/]\d{4}$/.test(year))throw new Error("ACADEMIC_YEAR_INVALID");
  return year;
};
const capacity=(value:unknown):number=>{
  if(typeof value!=="number"||!Number.isInteger(value)||value<1||value>5000)throw new Error("CLASS_CAPACITY_INVALID");
  return Number(value);
};

export async function runSchoolCommand<T>(
  client:PostgresTransactionClient,
  context:SchoolCommandContext,
  commandType:string,
  idempotencyKey:string,
  requestHash:string,
  action:CommandAction<T>
):Promise<SchoolCommandResult<T>>{
  if(!context.tenantId||!context.organizationId||!context.actorId)throw new Error("SCHOOL_COMMAND_CONTEXT_REQUIRED");
  if(!/^[A-Za-z0-9._:-]{12,128}$/.test(idempotencyKey))throw new Error("API_IDEMPOTENCY_KEY_INVALID");
  if(!SHA256.test(requestHash))throw new Error("SCHOOL_COMMAND_HASH_INVALID");
  const commandId=randomUUID();
  await client.query("BEGIN");
  try{
    await client.query(
      "SELECT set_config('tpay.tenant_id',$1,true),set_config('tpay.organization_id',$2,true)",
      [context.tenantId,context.organizationId]
    );
    const reserved=await client.query(
      "INSERT INTO api_request_deduplication(id,organization_id,idempotency_key,request_hash,route,state,created_at,expires_at) VALUES($1,$2,$3,$4,$5,'reserved',now(),now()+interval '24 hours') ON CONFLICT DO NOTHING RETURNING id",
      [commandId,context.organizationId,idempotencyKey,requestHash,commandType]
    );
    if((reserved.rowCount??0)===0){
      const existing=await client.query<{id:string;request_hash:string;route:string;state:string}>(
        "SELECT id,request_hash,route,state FROM api_request_deduplication WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE",
        [context.organizationId,idempotencyKey]
      );
      const prior=existing.rows[0];
      if(!prior)throw new Error("SCHOOL_COMMAND_IDEMPOTENCY_STATE_UNKNOWN");
      if(prior.request_hash!==requestHash||prior.route!==commandType)throw new Error("API_IDEMPOTENCY_CONFLICT");
      if(prior.state!=="succeeded")throw new Error("SCHOOL_COMMAND_PREVIOUS_ATTEMPT_INCOMPLETE");
      await client.query("COMMIT");
      return {replayed:true,commandId:prior.id,data:{} as T};
    }
    const result=await action(client,commandId);
    const metadata={commandType,resourceId:result.resourceId,requestHash};
    await client.query(
      "INSERT INTO education_school_command_audit(command_id,tenant_id,organization_id,actor_id,command_type,resource_id,request_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())",
      [commandId,context.tenantId,context.organizationId,context.actorId,commandType,result.resourceId,requestHash]
    );
    const eventPayload={commandId,tenantId:context.tenantId,organizationId:context.organizationId,actorId:context.actorId,...metadata,data:result.data};
    const payload=JSON.stringify(eventPayload);
    await client.query(
      "INSERT INTO education_sync_outbox(id,tenant_id,organization_id,event_id,event_type,payload,payload_hash,occurred_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,now())",
      [randomUUID(),context.tenantId,context.organizationId,commandId,"school."+commandType,payload,createHash("sha256").update(payload,"utf8").digest("hex")]
    );
    await client.query(
      "UPDATE api_request_deduplication SET state='succeeded',response_hash=$2,status_code=200 WHERE id=$1",
      [commandId,hash(result.data)]
    );
    await client.query("COMMIT");
    return {replayed:false,commandId,data:result.data};
  }catch(error){
    try{await client.query("ROLLBACK");}catch{}
    throw error;
  }
}

export async function createSchoolClass(client:PostgresTransactionClient,ctx:SchoolCommandContext,key:string,body:Record<string,unknown>){
  const name=required(body.name,"CLASS_NAME_REQUIRED",120);
  const gradeLevel=required(body.gradeLevel,"CLASS_GRADE_REQUIRED",80);
  const year=academicYear(body.academicYear);
  const max=capacity(body.capacity);
  const requestHash=hash({name,gradeLevel,year,max});
  return runSchoolCommand(client,ctx,"class.create",key,requestHash,async(db)=>{
    const classId=randomUUID();
    const result=await db.query(
      "INSERT INTO education_classes(tenant_id,organization_id,class_id,name,grade_level,academic_year,capacity,status) VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE') RETURNING class_id,name,grade_level,academic_year,capacity,status,version",
      [ctx.tenantId,ctx.organizationId,classId,name,gradeLevel,year,max]
    );
    if(!result.rows[0])throw new Error("SCHOOL_CLASS_CREATE_FAILED");
    return {resourceId:classId,data:result.rows[0]};
  });
}

export async function updateSchoolClass(client:PostgresTransactionClient,ctx:SchoolCommandContext,key:string,classIdInput:string,body:Record<string,unknown>){
  const classId=required(classIdInput,"CLASS_ID_REQUIRED",80);
  const name=required(body.name,"CLASS_NAME_REQUIRED",120);
  const gradeLevel=required(body.gradeLevel,"CLASS_GRADE_REQUIRED",80);
  const max=capacity(body.capacity);
  const expectedVersion=Number(body.expectedVersion);
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw new Error("CLASS_VERSION_REQUIRED");
  const requestHash=hash({classId,name,gradeLevel,max,expectedVersion});
  return runSchoolCommand(client,ctx,"class.update",key,requestHash,async(db)=>{
    const locked=await db.query<{class_id:string;version:string;status:string}>(
      "SELECT class_id,version::text,status FROM education_classes WHERE tenant_id=$1 AND organization_id=$2 AND class_id=$3 FOR UPDATE",
      [ctx.tenantId,ctx.organizationId,classId]
    );
    const current=locked.rows[0];
    if(!current)throw new Error("SCHOOL_CLASS_NOT_FOUND");
    if(current.status!=="ACTIVE")throw new Error("SCHOOL_CLASS_NOT_ACTIVE");
    if(Number(current.version)!==expectedVersion)throw new Error("SCHOOL_CLASS_VERSION_CONFLICT");
    const enrolled=await db.query<{count:string}>(
      "SELECT count(*)::text AS count FROM education_enrollments WHERE tenant_id=$1 AND organization_id=$2 AND class_id=$3 AND state='ENROLLED'",
      [ctx.tenantId,ctx.organizationId,classId]
    );
    if(max<Number(enrolled.rows[0]?.count??"0"))throw new Error("SCHOOL_CLASS_CAPACITY_BELOW_ENROLLED");
    const updated=await db.query(
      "UPDATE education_classes SET name=$4,grade_level=$5,capacity=$6,version=version+1,updated_at=now() WHERE tenant_id=$1 AND organization_id=$2 AND class_id=$3 RETURNING class_id,name,grade_level,academic_year,capacity,status,version",
      [ctx.tenantId,ctx.organizationId,classId,name,gradeLevel,max]
    );
    if(!updated.rows[0])throw new Error("SCHOOL_CLASS_UPDATE_FAILED");
    return {resourceId:classId,data:updated.rows[0]};
  });
}

export async function archiveSchoolClass(client:PostgresTransactionClient,ctx:SchoolCommandContext,key:string,classIdInput:string,expectedVersionInput:unknown){
  const classId=required(classIdInput,"CLASS_ID_REQUIRED",80);
  const expectedVersion=Number(expectedVersionInput);
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw new Error("CLASS_VERSION_REQUIRED");
  const requestHash=hash({classId,expectedVersion});
  return runSchoolCommand(client,ctx,"class.archive",key,requestHash,async(db)=>{
    const locked=await db.query<{version:string;status:string}>(
      "SELECT version::text,status FROM education_classes WHERE tenant_id=$1 AND organization_id=$2 AND class_id=$3 FOR UPDATE",
      [ctx.tenantId,ctx.organizationId,classId]
    );
    const current=locked.rows[0];
    if(!current)throw new Error("SCHOOL_CLASS_NOT_FOUND");
    if(Number(current.version)!==expectedVersion)throw new Error("SCHOOL_CLASS_VERSION_CONFLICT");
    if(current.status!=="ACTIVE")throw new Error("SCHOOL_CLASS_NOT_ACTIVE");
    const active=await db.query<{count:string}>(
      "SELECT count(*)::text AS count FROM education_enrollments WHERE tenant_id=$1 AND organization_id=$2 AND class_id=$3 AND state='ENROLLED'",
      [ctx.tenantId,ctx.organizationId,classId]
    );
    if(Number(active.rows[0]?.count??"0")>0)throw new Error("SCHOOL_CLASS_HAS_ACTIVE_ENROLLMENTS");
    const updated=await db.query(
      "UPDATE education_classes SET status='ARCHIVED',version=version+1,updated_at=now() WHERE tenant_id=$1 AND organization_id=$2 AND class_id=$3 RETURNING class_id,status,version",
      [ctx.tenantId,ctx.organizationId,classId]
    );
    if(!updated.rows[0])throw new Error("SCHOOL_CLASS_ARCHIVE_FAILED");
    return {resourceId:classId,data:updated.rows[0]};
  });
}

async function lockClass(db:PostgresTransactionClient,ctx:SchoolCommandContext,classId:string){
  const result=await db.query<{class_id:string;academic_year:string;capacity:number;status:string}>(
    "SELECT class_id,academic_year,capacity,status FROM education_classes WHERE tenant_id=$1 AND organization_id=$2 AND class_id=$3 FOR UPDATE",
    [ctx.tenantId,ctx.organizationId,classId]
  );
  const row=result.rows[0];
  if(!row)throw new Error("SCHOOL_CLASS_NOT_FOUND");
  if(row.status!=="ACTIVE")throw new Error("SCHOOL_CLASS_NOT_ACTIVE");
  return row;
}
async function assertCapacity(db:PostgresTransactionClient,ctx:SchoolCommandContext,classId:string,capacityLimit:number){
  const count=await db.query<{count:string}>(
    "SELECT count(*)::text AS count FROM education_enrollments WHERE tenant_id=$1 AND organization_id=$2 AND class_id=$3 AND state='ENROLLED'",
    [ctx.tenantId,ctx.organizationId,classId]
  );
  if(Number(count.rows[0]?.count??"0")>=capacityLimit)throw new Error("SCHOOL_CLASS_CAPACITY_REACHED");
}
export async function enrollStudent(client:PostgresTransactionClient,ctx:SchoolCommandContext,key:string,body:Record<string,unknown>){
  const studentId=required(body.studentId,"STUDENT_ID_REQUIRED",80);
  const classId=required(body.classId,"CLASS_ID_REQUIRED",80);
  const year=academicYear(body.academicYear);
  const startedAt=typeof body.startedAt==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(body.startedAt)?body.startedAt:new Date().toISOString().slice(0,10);
  const requestHash=hash({studentId,classId,year,startedAt});
  return runSchoolCommand(client,ctx,"enrollment.create",key,requestHash,async(db)=>{
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [ctx.tenantId+"|"+ctx.organizationId+"|"+studentId]
    );
    const klass=await lockClass(db,ctx,classId);
    if(klass.academic_year!==year)throw new Error("SCHOOL_ENROLLMENT_ACADEMIC_YEAR_MISMATCH");
    const student=await db.query<{student_id:string;lifecycle:string}>(
      "SELECT student_id,lifecycle FROM education_students WHERE tenant_id=$1 AND organization_id=$2 AND student_id=$3",
      [ctx.tenantId,ctx.organizationId,studentId]
    );
    if(!student.rows[0])throw new Error("SCHOOL_STUDENT_NOT_FOUND");
    if(["WITHDRAWN","ALUMNI"].includes(student.rows[0].lifecycle))throw new Error("SCHOOL_STUDENT_NOT_ELIGIBLE");
    const existing=await db.query(
      "SELECT enrollment_id FROM education_enrollments WHERE tenant_id=$1 AND organization_id=$2 AND student_id=$3 AND academic_year=$4 AND state='ENROLLED' FOR UPDATE",
      [ctx.tenantId,ctx.organizationId,studentId,year]
    );
    if(existing.rows.length)throw new Error("SCHOOL_STUDENT_ALREADY_ENROLLED");
    await assertCapacity(db,ctx,classId,Number(klass.capacity));
    const enrollmentId=randomUUID();
    const inserted=await db.query(
      "INSERT INTO education_enrollments(tenant_id,organization_id,enrollment_id,student_id,class_id,academic_year,state,started_at) VALUES($1,$2,$3,$4,$5,$6,'ENROLLED',$7) RETURNING enrollment_id,student_id,class_id,academic_year,state,started_at,version",
      [ctx.tenantId,ctx.organizationId,enrollmentId,studentId,classId,year,startedAt]
    );
    if(!inserted.rows[0])throw new Error("SCHOOL_ENROLLMENT_CREATE_FAILED");
    return {resourceId:enrollmentId,data:inserted.rows[0]};
  });
}
export async function transferStudent(client:PostgresTransactionClient,ctx:SchoolCommandContext,key:string,enrollmentIdInput:string,body:Record<string,unknown>){
  const enrollmentId=required(enrollmentIdInput,"ENROLLMENT_ID_REQUIRED",80);
  const targetClassId=required(body.targetClassId,"TARGET_CLASS_ID_REQUIRED",80);
  const requestHash=hash({enrollmentId,targetClassId});
  return runSchoolCommand(client,ctx,"enrollment.transfer",key,requestHash,async(db)=>{
    const identity=await db.query<{student_id:string}>(
      "SELECT student_id FROM education_enrollments WHERE tenant_id=$1 AND organization_id=$2 AND enrollment_id=$3 AND state='ENROLLED'",
      [ctx.tenantId,ctx.organizationId,enrollmentId]
    );
    const studentId=identity.rows[0]?.student_id;
    if(!studentId)throw new Error("SCHOOL_ACTIVE_ENROLLMENT_NOT_FOUND");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[ctx.tenantId+"|"+ctx.organizationId+"|"+studentId]);
    const active=await db.query<{enrollment_id:string;student_id:string;class_id:string;academic_year:string;version:string}>(
      "SELECT enrollment_id,student_id,class_id,academic_year,version::text FROM education_enrollments WHERE tenant_id=$1 AND organization_id=$2 AND enrollment_id=$3 AND state='ENROLLED' FOR UPDATE",
      [ctx.tenantId,ctx.organizationId,enrollmentId]
    );
    const source=active.rows[0];
    if(!source)throw new Error("SCHOOL_ACTIVE_ENROLLMENT_NOT_FOUND");
    if(source.class_id===targetClassId)throw new Error("SCHOOL_TRANSFER_SAME_CLASS");
    const ids=[source.class_id,targetClassId].sort();
    const locked=await db.query<{class_id:string;academic_year:string;capacity:number;status:string}>(
      "SELECT class_id,academic_year,capacity,status FROM education_classes WHERE tenant_id=$1 AND organization_id=$2 AND class_id=ANY($3::text[]) ORDER BY class_id FOR UPDATE",
      [ctx.tenantId,ctx.organizationId,ids]
    );
    if(locked.rows.length!==2)throw new Error("SCHOOL_CLASS_NOT_FOUND");
    const target=locked.rows.find(row=>row.class_id===targetClassId);
    const origin=locked.rows.find(row=>row.class_id===source.class_id);
    if(!target||!origin||origin.status!=="ACTIVE"||target.status!=="ACTIVE")throw new Error("SCHOOL_CLASS_NOT_ACTIVE");
    if(target.academic_year!==source.academic_year)throw new Error("SCHOOL_TRANSFER_ACADEMIC_YEAR_MISMATCH");
    await assertCapacity(db,ctx,targetClassId,Number(target.capacity));
    const ended=await db.query(
      "UPDATE education_enrollments SET state='TRANSFERRED',ended_at=current_date,version=version+1,updated_at=now() WHERE tenant_id=$1 AND organization_id=$2 AND enrollment_id=$3 AND state='ENROLLED' RETURNING enrollment_id",
      [ctx.tenantId,ctx.organizationId,enrollmentId]
    );
    if(!ended.rows[0])throw new Error("SCHOOL_TRANSFER_SOURCE_CHANGED");
    const nextId=randomUUID();
    const inserted=await db.query(
      "INSERT INTO education_enrollments(tenant_id,organization_id,enrollment_id,student_id,class_id,academic_year,state,started_at) VALUES($1,$2,$3,$4,$5,$6,'ENROLLED',current_date) RETURNING enrollment_id,student_id,class_id,academic_year,state,started_at,version",
      [ctx.tenantId,ctx.organizationId,nextId,source.student_id,targetClassId,source.academic_year]
    );
    if(!inserted.rows[0])throw new Error("SCHOOL_TRANSFER_TARGET_CREATE_FAILED");
    return {resourceId:nextId,data:{previousEnrollmentId:enrollmentId,...inserted.rows[0]}};
  });
}
export async function withdrawStudent(client:PostgresTransactionClient,ctx:SchoolCommandContext,key:string,enrollmentIdInput:string,reasonInput:unknown){
  const enrollmentId=required(enrollmentIdInput,"ENROLLMENT_ID_REQUIRED",80);
  const reason=required(reasonInput,"WITHDRAWAL_REASON_REQUIRED",500);
  const requestHash=hash({enrollmentId,reason});
  return runSchoolCommand(client,ctx,"enrollment.withdraw",key,requestHash,async(db)=>{
    const identity=await db.query<{student_id:string}>(
      "SELECT student_id FROM education_enrollments WHERE tenant_id=$1 AND organization_id=$2 AND enrollment_id=$3 AND state='ENROLLED'",
      [ctx.tenantId,ctx.organizationId,enrollmentId]
    );
    const studentId=identity.rows[0]?.student_id;
    if(!studentId)throw new Error("SCHOOL_ACTIVE_ENROLLMENT_NOT_FOUND");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[ctx.tenantId+"|"+ctx.organizationId+"|"+studentId]);
    const active=await db.query<{enrollment_id:string;student_id:string}>(
      "SELECT enrollment_id,student_id FROM education_enrollments WHERE tenant_id=$1 AND organization_id=$2 AND enrollment_id=$3 AND state='ENROLLED' FOR UPDATE",
      [ctx.tenantId,ctx.organizationId,enrollmentId]
    );
    if(!active.rows[0])throw new Error("SCHOOL_ACTIVE_ENROLLMENT_NOT_FOUND");
    const updated=await db.query(
      "UPDATE education_enrollments SET state='WITHDRAWN',ended_at=current_date,version=version+1,updated_at=now() WHERE tenant_id=$1 AND organization_id=$2 AND enrollment_id=$3 AND state='ENROLLED' RETURNING enrollment_id,student_id,state,ended_at,version",
      [ctx.tenantId,ctx.organizationId,enrollmentId]
    );
    if(!updated.rows[0])throw new Error("SCHOOL_WITHDRAWAL_FAILED");
    return {resourceId:enrollmentId,data:{...updated.rows[0],reason}};
  });
}
