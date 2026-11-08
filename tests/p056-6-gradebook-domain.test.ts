import test from "node:test";
import assert from "node:assert/strict";
import { lockAssessment, normalizeGrade, validateAssessmentInput, validateGradeInput } from "../packages/education/src/gradebook.js";

const assessment = {
  classId: "class-1",
  academicYear: "2026-2027",
  subjectCode: "MATH",
  periodCode: "T1",
  title: "Composition 1",
  assessmentDate: "2026-10-15",
  maxScore: 20,
  coefficient: 2
};

test("P056.6 validates academic assessment contracts", () => {
  assert.equal(validateAssessmentInput(assessment).title, "Composition 1");
  assert.throws(() => validateAssessmentInput({ ...assessment, academicYear: "2026-2028" }), /EDUCATION_ACADEMIC_YEAR_INVALID/);
  assert.throws(() => validateAssessmentInput({ ...assessment, subjectCode: "math" }), /EDUCATION_SUBJECT_CODE_INVALID/);
  assert.throws(() => validateAssessmentInput({ ...assessment, assessmentDate: "2026-02-30" }), /EDUCATION_ASSESSMENT_DATE_INVALID/);
  assert.throws(() => validateAssessmentInput({ ...assessment, maxScore: 0 }), /EDUCATION_ASSESSMENT_MAX_SCORE_INVALID/);
  assert.throws(() => validateAssessmentInput({ ...assessment, coefficient: 101 }), /EDUCATION_ASSESSMENT_COEFFICIENT_INVALID/);
});

test("P056.6 validates grade bounds, comment and optimistic version", () => {
  assert.equal(validateGradeInput({ enrollmentId: "enr-1", score: 15, expectedVersion: 2 }, 20).score, 15);
  assert.throws(() => validateGradeInput({ enrollmentId: "enr-1", score: 20.01 }, 20), /EDUCATION_GRADE_SCORE_OUT_OF_RANGE/);
  assert.throws(() => validateGradeInput({ enrollmentId: "enr-1", score: 10, expectedVersion: 0 }, 20), /EDUCATION_GRADE_VERSION_INVALID/);
  assert.throws(() => validateGradeInput({ enrollmentId: "enr-1", score: 10, teacherComment: "x".repeat(1001) }, 20), /EDUCATION_GRADE_COMMENT_TOO_LONG/);
});

test("P056.6 normalizes grades without floating-point money semantics", () => {
  assert.equal(normalizeGrade(15, 20), 15);
  assert.equal(normalizeGrade(30, 40), 15);
  assert.equal(normalizeGrade(7, 10, 20), 14);
  assert.throws(() => normalizeGrade(21, 20), /EDUCATION_GRADE_NORMALIZATION_INVALID/);
});

test("P056.6 assessment locking is one-way", () => {
  assert.equal(lockAssessment("OPEN"), "LOCKED");
  assert.throws(() => lockAssessment("LOCKED"), /EDUCATION_ASSESSMENT_ALREADY_LOCKED/);
});
