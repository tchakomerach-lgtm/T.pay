import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("P060 School OS schema declares class/enrollment history and fail-closed tenant RLS",()=>{
 const sql=readFileSync("migrations/115_school_classes_enrollments.sql","utf8");
 assert.match(sql,/CREATE TABLE IF NOT EXISTS education_classes/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS education_enrollments/);
 assert.match(sql,/FOREIGN KEY \(tenant_id, organization_id, student_id\)/);
 assert.match(sql,/FOREIGN KEY \(tenant_id, organization_id, class_id\)/);
 assert.match(sql,/uq_education_one_active_enrollment_per_year/);
 assert.match(sql,/education_classes FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/education_enrollments FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/education_classes_tenant_read/);
 assert.match(sql,/education_enrollments_tenant_read/);
 assert.match(sql,/education_classes_tenant_insert/);
 assert.match(sql,/education_enrollments_tenant_insert/);
 assert.match(sql,/current_setting\('tpay\.tenant_id', true\)/);
 assert.match(sql,/current_setting\('tpay\.organization_id', true\)/);
});
