import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("P060 live PostgreSQL enforces organization-scoped class and enrollment RLS",{
 skip:!databaseUrl && "TPAY_DATABASE_URL is not configured"
},async()=>{
 const client=new pg.Client({connectionString:databaseUrl});
 await client.connect();
 const tenantA="tenant-"+randomUUID();
 const organizationA="org-"+randomUUID();
 const tenantB="tenant-"+randomUUID();
 const organizationB="org-"+randomUUID();
 const studentA=randomUUID();
 const studentB=randomUUID();
 const classA=randomUUID();
 const classB=randomUUID();
 try{
  await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  await client.query("BEGIN");
  await client.query("DO 'BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ''tpay_school_rls_test'') THEN CREATE ROLE tpay_school_rls_test NOLOGIN; END IF; END';");
  await client.query("GRANT SELECT,INSERT ON education_classes,education_enrollments TO tpay_school_rls_test");
  await client.query("INSERT INTO education_students(student_id,tenant_id,organization_id,lifecycle) VALUES($1,$2,$3,'ACTIVE'),($4,$5,$6,'ACTIVE')",
   [studentA,tenantA,organizationA,studentB,tenantB,organizationB]);

  await client.query("SET LOCAL ROLE tpay_school_rls_test");
  await client.query("SELECT set_config('tpay.tenant_id',$1,true),set_config('tpay.organization_id',$2,true)",[tenantA,organizationA]);
  await client.query("INSERT INTO education_classes(tenant_id,organization_id,class_id,name,grade_level,academic_year,capacity) VALUES($1,$2,$3,'6e A','6e','2026-2027',45)",
   [tenantA,organizationA,classA]);
  await client.query("INSERT INTO education_enrollments(tenant_id,organization_id,enrollment_id,student_id,class_id,academic_year,state,started_at) VALUES($1,$2,$3,$4,$5,'2026-2027','ENROLLED','2026-09-01')",
   [tenantA,organizationA,randomUUID(),studentA,classA]);

  await client.query("SELECT set_config('tpay.tenant_id',$1,true),set_config('tpay.organization_id',$2,true)",[tenantB,organizationB]);
  await client.query("INSERT INTO education_classes(tenant_id,organization_id,class_id,name,grade_level,academic_year,capacity) VALUES($1,$2,$3,'6e A','6e','2026-2027',45)",
   [tenantB,organizationB,classB]);
  await client.query("INSERT INTO education_enrollments(tenant_id,organization_id,enrollment_id,student_id,class_id,academic_year,state,started_at) VALUES($1,$2,$3,$4,$5,'2026-2027','ENROLLED','2026-09-01')",
   [tenantB,organizationB,randomUUID(),studentB,classB]);

  await client.query("SELECT set_config('tpay.tenant_id',$1,true),set_config('tpay.organization_id',$2,true)",[tenantA,organizationA]);
  const classes=await client.query("SELECT class_id FROM education_classes");
  const enrollments=await client.query("SELECT enrollment_id FROM education_enrollments");
  assert.deepEqual(classes.rows.map(row=>row.class_id),[classA]);
  assert.equal(enrollments.rowCount,1);

  await assert.rejects(
   client.query("INSERT INTO education_classes(tenant_id,organization_id,class_id,name,grade_level,academic_year,capacity) VALUES($1,$2,$3,'Intrusion','6e','2026-2027',45)",
    [tenantB,organizationB,randomUUID()]),
   /row-level security/i
  );
 }finally{
  try{await client.query("ROLLBACK");}catch{}
  await client.end();
 }
});


test("P061 live PostgreSQL commits class, enrollment, transfer, withdrawal, audit and outbox atomically",{
 skip:!databaseUrl && "TPAY_DATABASE_URL is not configured"
},async()=>{
 const pool=new pg.Pool({connectionString:databaseUrl});
 const tenantA=randomUUID(),organizationA=randomUUID(),tenantB=randomUUID(),organizationB=randomUUID();
 const actor=randomUUID(),studentA=randomUUID(),studentB=randomUUID();
 const contextA={tenantId:tenantA,organizationId:organizationA,actorId:actor};
 const contextB={tenantId:tenantB,organizationId:organizationB,actorId:actor};
 try{
  const admin=await pool.connect();
  try{
   await applyMigrations(admin,pathToFileURL(join(process.cwd(),"migrations")+"/"));
   await admin.query("DO 'BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ''tpay_school_command_test'') THEN CREATE ROLE tpay_school_command_test NOLOGIN; END IF; END';");
   await admin.query("GRANT SELECT,INSERT,UPDATE ON education_classes,education_enrollments,education_students TO tpay_school_command_test");
   await admin.query("GRANT INSERT ON education_school_command_audit,education_sync_outbox TO tpay_school_command_test");
   await admin.query("GRANT SELECT,INSERT,UPDATE ON api_request_deduplication TO tpay_school_command_test");
   await admin.query("INSERT INTO education_students(student_id,tenant_id,organization_id,lifecycle) VALUES($1,$2,$3,'ACTIVE'),($4,$2,$3,'ACTIVE')",[studentA,tenantA,organizationA,studentB]);
  }finally{admin.release();}

  const withRuntime=async<T>(work:(db:PostgresTransactionClient)=>Promise<T>):Promise<T>=>{
   const c=await pool.connect();
   try{
    await c.query("SET ROLE tpay_school_command_test");
    const db={query:async<T extends import("pg").QueryResultRow=Record<string,unknown>>(sql:string,values?:unknown[])=>{
     const result=await c.query<T>(sql,values);
     return {rows:result.rows,rowCount:result.rowCount};
    }};
    return await work(db as PostgresTransactionClient);
   }finally{
    try{await c.query("RESET ROLE");}finally{c.release();}
   }
  };

  const created=await withRuntime(db=>createSchoolClass(db,contextA,"school-class-create-0001",{name:"6e A",gradeLevel:"6e",academicYear:"2026-2027",capacity:1}));
  assert.equal(created.replayed,false);
  const replay=await withRuntime(db=>createSchoolClass(db,contextA,"school-class-create-0001",{name:"6e A",gradeLevel:"6e",academicYear:"2026-2027",capacity:1}));
  assert.equal(replay.replayed,true);
  const classId=String((created.data as Record<string,unknown>).class_id);

  const attempts=await Promise.allSettled([
   withRuntime(db=>enrollStudent(db,contextA,"school-enroll-student-a-0001",{studentId:studentA,classId,academicYear:"2026-2027"})),
   withRuntime(db=>enrollStudent(db,contextA,"school-enroll-student-b-0001",{studentId:studentB,classId,academicYear:"2026-2027"}))
  ]);
  assert.equal(attempts.filter(item=>item.status==="fulfilled").length,1);
  assert.equal(attempts.filter(item=>item.status==="rejected").length,1);
  const winner=attempts.find(item=>item.status==="fulfilled");
  assert.ok(winner&&winner.status==="fulfilled");
  const enrollmentId=String((winner.value.data as Record<string,unknown>).enrollment_id);

  const target=await withRuntime(db=>createSchoolClass(db,contextA,"school-class-create-0002",{name:"6e B",gradeLevel:"6e",academicYear:"2026-2027",capacity:1}));
  const targetClassId=String((target.data as Record<string,unknown>).class_id);
  const transferred=await withRuntime(db=>transferStudent(db,contextA,"school-transfer-enrollment-0001",enrollmentId,{targetClassId}));
  const newEnrollmentId=String((transferred.data as Record<string,unknown>).enrollment_id);
  const withdrawn=await withRuntime(db=>withdrawStudent(db,contextA,"school-withdraw-enrollment-0001",newEnrollmentId,"Départ de l'établissement"));
  assert.equal((withdrawn.data as Record<string,unknown>).state,"WITHDRAWN");

  const activeAgain=await withRuntime(db=>enrollStudent(db,contextA,"school-enroll-student-b-0002",{studentId:studentB,classId:targetClassId,academicYear:"2026-2027"}));
  assert.equal(activeAgain.replayed,false);

  const classB=await withRuntime(db=>createSchoolClass(db,contextB,"school-class-create-orgb-001",{name:"6e A",gradeLevel:"6e",academicYear:"2026-2027",capacity:10}));
  assert.ok(classB.data);
  const visible=await withRuntime(async db=>{
   await db.query("BEGIN");
   try{
    await db.query("SELECT set_config('tpay.tenant_id',$1,true),set_config('tpay.organization_id',$2,true)",[tenantA,organizationA]);
    const result=await db.query("SELECT class_id FROM education_classes");
    await db.query("COMMIT");
    return result.rows.map(row=>String(row.class_id));
   }catch(error){await db.query("ROLLBACK");throw error;}
  });
  assert.ok(visible.includes(classId));
  assert.ok(!visible.includes(String((classB.data as Record<string,unknown>).class_id)));

  const evidence=await pool.query(
   "SELECT (SELECT count(*)::int FROM education_school_command_audit WHERE tenant_id=$1 AND organization_id=$2) AS audits,(SELECT count(*)::int FROM education_sync_outbox WHERE tenant_id=$1 AND organization_id=$2 AND event_type LIKE 'school.%') AS events",
   [tenantA,organizationA]
  );
  assert.equal(Number(evidence.rows[0].audits),6);
  assert.equal(Number(evidence.rows[0].events),6);
 }finally{
  await pool.end();
 }
});
