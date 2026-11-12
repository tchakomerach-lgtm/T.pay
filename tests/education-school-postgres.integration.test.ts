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
  await client.query("INSERT INTO education_students(student_id,tenant_id,organization_id,lifecycle) VALUES($1,$2,$3,'ACTIVE'),($4,$5,$6,'ACTIVE')",
   [studentA,tenantA,organizationA,studentB,tenantB,organizationB]);

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
