import test from "node:test";
import assert from "node:assert/strict";
import { createBulletinSnapshot } from "../packages/education/src/bulletin-snapshot.js";
import { calculateStudentTermResult, rankTermResults, type AssessmentMark } from "../packages/education/src/term-results.js";

const marks: AssessmentMark[] = [
  { assessmentId: "a1", subjectCode: "MATH", score: 16, maxScore: 20, assessmentCoefficient: 1, outcome: "GRADED" },
  { assessmentId: "a2", subjectCode: "FR", score: 14, maxScore: 20, assessmentCoefficient: 1, outcome: "GRADED" }
];
const rules = [{ subjectCode: "MATH", coefficient: 4 }, { subjectCode: "FR", coefficient: 2 }];
const result = rankTermResults([calculateStudentTermResult({ studentId: "student-1", marks }, rules)])[0]!;
const input = () => ({
  result,
  student: { studentId: "student-1", studentNumber: "2026-001", displayName: "Élève Exemple" },
  brand: { organizationName: "Établissement Exemple", logoAssetId: "asset:school-logo:v1", primaryColor: "#0F8F68" },
  template: { templateId: "school-bulletin", version: 3, locale: "fr-TG" },
  context: {
    organizationId: "org-1", academicYear: "2026-2027", periodCode: "T1",
    periodLabel: "Premier trimestre", classId: "class-1", classLabel: "6e A",
    issuedAt: "2026-11-08T10:00:00.000Z"
  }
});

test("P056.8 creates a self-contained immutable snapshot from complete term results", () => {
  const snapshot = createBulletinSnapshot(input());
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.result.average, result.average);
  assert.equal(snapshot.template.version, 3);
  assert.equal(snapshot.brand.logoAssetId, "asset:school-logo:v1");
  assert.match(snapshot.contentHash, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.result.subjects));
});

test("P056.8 content hash is deterministic and independent of source subject order", () => {
  const first = createBulletinSnapshot(input());
  const reordered = input();
  reordered.result = { ...result, subjects: [...result.subjects].reverse() };
  const second = createBulletinSnapshot(reordered);
  assert.equal(first.contentHash, second.contentHash);
});

test("P056.8 refuses incomplete term results and missing required subject results", () => {
  const bad = input();
  bad.result = { ...result, status: "INCOMPLETE", average: null };
  assert.throws(() => createBulletinSnapshot(bad), /EDUCATION_BULLETIN_TERM_RESULT_INCOMPLETE/);
});

test("P056.8 refuses invalid template versions, academic years and branding", () => {
  const badTemplate = input();
  badTemplate.template.version = 0;
  assert.throws(() => createBulletinSnapshot(badTemplate), /EDUCATION_BULLETIN_TEMPLATE_VERSION_INVALID/);
  const badYear = input();
  badYear.context.academicYear = "2026-2028";
  assert.throws(() => createBulletinSnapshot(badYear), /EDUCATION_BULLETIN_ACADEMIC_YEAR_INVALID/);
  const badBrand = input();
  badBrand.brand.primaryColor = "green";
  assert.throws(() => createBulletinSnapshot(badBrand), /EDUCATION_BULLETIN_BRAND_COLOR_INVALID/);
});

test("P056.8 rejects duplicate subject rows and non-complete subjects", () => {
  const duplicate = input();
  duplicate.result = { ...result, subjects: [result.subjects[0]!, result.subjects[0]!] };
  assert.throws(() => createBulletinSnapshot(duplicate), /EDUCATION_BULLETIN_SUBJECT_SET_INVALID/);
  const incomplete = input();
  incomplete.result = { ...result, subjects: [{ ...result.subjects[0]!, status: "INCOMPLETE", average: null }] };
  assert.throws(() => createBulletinSnapshot(incomplete), /EDUCATION_BULLETIN_SUBJECT_RESULT_INCOMPLETE/);
});

test("P056.8 binds the calculated result to the exact student and grading scale", () => {
  const mismatched = input();
  mismatched.student.studentId = "another-student";
  assert.throws(() => createBulletinSnapshot(mismatched), /EDUCATION_BULLETIN_STUDENT_CONTEXT_MISMATCH/);
  const outsideScale = input();
  outsideScale.result = { ...result, average: 21 };
  assert.throws(() => createBulletinSnapshot(outsideScale), /EDUCATION_BULLETIN_AVERAGE_OUT_OF_RANGE/);
});
