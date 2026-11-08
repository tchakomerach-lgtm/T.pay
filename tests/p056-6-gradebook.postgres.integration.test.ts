import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("P056.6 assessment and gradebook enforce organization RLS and relational scope on PostgreSQL",
 {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"},async()=>{
  const client=new pg.Client({connectionString:databaseUrl});
  const tenantA="p0566-a-"+randomUUID(),tenantB="p0566-b-"+randomUUID();
  const orgA="p0566-org-a-"+randomUUID(),orgB="p0566-org-b-"+randomUUID();
  const actorA="p0566-director-a-"+randomUUID(),actorB="p0566-director-b-"+randomUUID();
  const studentA="p0566-student-a-"+randomUUID(),studentB="p0566-student-b-"+randomUUID();
  const classA="p0566-class-a-"+randomUUID(),classB="p0566-class-b-"+randomUUID();
  const enrollmentA="p0566-enrollment-a-"+randomUUID(),enrollmentB="p0566-enrollment-b-"+randomUUID();
  const subjectA="P"+randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
  const subjectB="Q"+randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
  const assessmentA=randomUUID(),assessmentB=randomUUID(),gradeA=randomUUID();
  try{
    await client.connect();
    await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
    await client.query(
      "INSERT INTO education_actors(actor_id,tenant_id,organization_id,kind,active) VALUES($1,$2,$3,'DIRECTOR',true),($4,$5,$6,'DIRECTOR',true)",
      [actorA,tenantA,orgA,actorB,tenantB,orgB]
    );
    await client.query(
      "INSERT INTO education_students(student_id,tenant_id,organization_id,lifecycle) VALUES($1,$2,$3,'ACTIVE'),($4,$5,$6,'ACTIVE')",
      [studentA,tenantA,orgA,studentB,tenantB,orgB]
    );
    await client.query(
      "INSERT INTO education_classes(class_id,tenant_id,organization_id,academic_year,code,name,level,capacity,created_by) VALUES($1,$2,$3,'2026-2027','C-A','Class A','SECONDARY',40,$4),($5,$6,$7,'2026-2027','C-B','Class B','SECONDARY',40,$8)",
      [classA,tenantA,orgA,actorA,classB,tenantB,orgB,actorB]
    );
    await client.query(
      "INSERT INTO education_subjects(tenant_id,organization_id,subject_code,name,coefficient,created_by) VALUES($1,$2,$3,'Mathematics',2,$4),($5,$6,$7,'Science',1,$8)",
      [tenantA,orgA,subjectA,actorA,tenantB,orgB,subjectB,actorB]
    );
    await client.query(
      "INSERT INTO education_enrollments(enrollment_id,tenant_id,organization_id,student_id,class_id,academic_year,status,created_by) VALUES($1,$2,$3,$4,$5,'2026-2027','ACTIVE',$6),($7,$8,$9,$10,$11,'2026-2027','ACTIVE',$12)",
      [enrollmentA,tenantA,orgA,studentA,classA,actorA,enrollmentB,tenantB,orgB,studentB,classB,actorB]
    );
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tpay_school_runtime");
    await client.query("SELECT set_config('tpay.tenant_id',$1,true),set_config('tpay.organization_id',$2,true)",[tenantA,orgA]);
    await client.query(
      "INSERT INTO education_assessments(assessment_id,tenant_id,organization_id,class_id,academic_year,subject_code,period_code,title,assessment_date,max_score,coefficient,created_by) VALUES($1,$2,$3,$4,'2026-2027',$5,'T1','Test A','2026-10-15',20,2,$6)",
      [assessmentA,tenantA,orgA,classA,subjectA,actorA]
    );
    await client.query(
      "INSERT INTO education_grades(grade_id,tenant_id,organization_id,assessment_id,enrollment_id,score,entered_by) VALUES($1,$2,$3,$4,$5,15,$6)",
      [gradeA,tenantA,orgA,assessmentA,enrollmentA,actorA]
    );
    const own=await client.query("SELECT score FROM education_grades WHERE tenant_id=$1 AND organization_id=$2",[tenantA,orgA]);
    assert.equal(own.rowCount,1);
    assert.equal(Number(own.rows[0]?.score),15);
    const hidden=await client.query("SELECT grade_id FROM education_grades WHERE tenant_id=$1 AND organization_id=$2",[tenantB,orgB]);
    assert.equal(hidden.rowCount,0);
    await assert.rejects(
      client.query(
        "INSERT INTO education_assessments(assessment_id,tenant_id,organization_id,class_id,academic_year,subject_code,period_code,title,assessment_date,max_score,coefficient,created_by) VALUES($1,$2,$3,$4,'2026-2027',$5,'T1','Cross tenant','2026-10-15',20,1,$6)",
        [assessmentB,tenantB,orgB,classB,subjectB,actorB]
      ),
      /row-level security|policy/i
    );
    await client.query("ROLLBACK");
  }finally{
    await client.query("ROLLBACK").catch(()=>undefined);
    await client.query("DELETE FROM education_grades WHERE assessment_id=$1",[assessmentA]).catch(()=>undefined);
    await client.query("DELETE FROM education_assessments WHERE assessment_id IN ($1,$2)",[assessmentA,assessmentB]).catch(()=>undefined);
    await client.query("DELETE FROM education_enrollments WHERE enrollment_id IN ($1,$2)",[enrollmentA,enrollmentB]).catch(()=>undefined);
    await client.query("DELETE FROM education_class_assignments WHERE tenant_id IN ($1,$2)",[tenantA,tenantB]).catch(()=>undefined);
    await client.query("DELETE FROM education_classes WHERE class_id IN ($1,$2)",[classA,classB]).catch(()=>undefined);
    await client.query("DELETE FROM education_subjects WHERE (tenant_id=$1 AND organization_id=$2) OR (tenant_id=$3 AND organization_id=$4)",[tenantA,orgA,tenantB,orgB]).catch(()=>undefined);
    await client.query("DELETE FROM education_students WHERE student_id IN ($1,$2)",[studentA,studentB]).catch(()=>undefined);
    await client.query("DELETE FROM education_actors WHERE actor_id IN ($1,$2)",[actorA,actorB]).catch(()=>undefined);
    await client.end().catch(()=>undefined);
  }
});
