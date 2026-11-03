import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("P056.4 teaching assignments enforce tenant and organization RLS on PostgreSQL", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  const tenantA = "p0564-a-" + randomUUID();
  const tenantB = "p0564-b-" + randomUUID();
  const orgA = "p0564-org-a-" + randomUUID();
  const orgB = "p0564-org-b-" + randomUUID();
  const directorA = "director-" + randomUUID();
  const teacherA = "teacher-" + randomUUID();
  const directorB = "director-" + randomUUID();
  const teacherB = "teacher-" + randomUUID();
  const classA = "class-" + randomUUID();
  const classB = "class-" + randomUUID();
  const assignmentId = randomUUID();

  try {
    await client.connect();
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));

    await client.query(
      "INSERT INTO education_actors(actor_id,tenant_id,organization_id,kind,active) VALUES($1,$3,$4,'DIRECTOR',true),($2,$3,$4,'TEACHER',true),($5,$7,$8,'DIRECTOR',true),($6,$7,$8,'TEACHER',true)",
      [directorA, teacherA, tenantA, orgA, directorB, teacherB, tenantB, orgB]
    );
    await client.query(
      "INSERT INTO education_classes(class_id,tenant_id,organization_id,academic_year,code,name,level,capacity,status,created_by) VALUES($1,$2,$3,'2026-2027','A1','Class A','SECONDARY',40,'ACTIVE',$4),($5,$6,$7,'2026-2027','B1','Class B','SECONDARY',40,'ACTIVE',$8)",
      [classA, tenantA, orgA, directorA, classB, tenantB, orgB, directorB]
    );

    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tpay_school_runtime");
    await client.query("SELECT set_config('tpay.tenant_id',$1,true),set_config('tpay.organization_id',$2,true)", [tenantA, orgA]);

    await client.query(
      "INSERT INTO education_class_assignments(assignment_id,tenant_id,organization_id,class_id,academic_year,teacher_actor_id,subject_code,weekly_hours,valid_from,created_by) VALUES($1,$2,$3,$4,'2026-2027',$5,'MATH',4,'2026-09-01',$6)",
      [assignmentId, tenantA, orgA, classA, teacherA, directorA]
    );
    const visible = await client.query(
      "SELECT assignment_id FROM education_class_assignments WHERE tenant_id=$1 AND organization_id=$2",
      [tenantA, orgA]
    );
    assert.equal(visible.rowCount, 1);

    const hidden = await client.query(
      "SELECT assignment_id FROM education_class_assignments WHERE tenant_id=$1 AND organization_id=$2",
      [tenantB, orgB]
    );
    assert.equal(hidden.rowCount, 0);

    await assert.rejects(
      client.query(
        "INSERT INTO education_class_assignments(tenant_id,organization_id,class_id,academic_year,teacher_actor_id,subject_code,weekly_hours,valid_from,created_by) VALUES($1,$2,$3,'2026-2027',$4,'SCI',3,'2026-09-01',$5)",
        [tenantB, orgB, classB, teacherB, directorB]
      ),
      /row-level security|policy/i
    );
    await client.query("ROLLBACK");
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query("DELETE FROM education_class_assignments WHERE assignment_id=$1", [assignmentId]).catch(() => undefined);
    await client.query("DELETE FROM education_classes WHERE class_id IN ($1,$2)", [classA, classB]).catch(() => undefined);
    await client.query("DELETE FROM education_actors WHERE actor_id IN ($1,$2,$3,$4)", [directorA, teacherA, directorB, teacherB]).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
});
