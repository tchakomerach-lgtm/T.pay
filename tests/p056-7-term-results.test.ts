import test from "node:test";
import assert from "node:assert/strict";
import { calculateStudentTermResult, calculateSubjectResult, rankTermResults, type AssessmentMark } from "../packages/education/src/term-results.js";

const rules = [{ subjectCode: "MATH", coefficient: 4 }, { subjectCode: "FR", coefficient: 2 }];
const marks: AssessmentMark[] = [
  { assessmentId: "m1", subjectCode: "MATH", score: 15, maxScore: 20, assessmentCoefficient: 2, outcome: "GRADED" },
  { assessmentId: "m2", subjectCode: "MATH", score: 10, maxScore: 20, assessmentCoefficient: 1, outcome: "GRADED" },
  { assessmentId: "f1", subjectCode: "FR", score: 12, maxScore: 20, assessmentCoefficient: 1, outcome: "GRADED" }
];

test("P056.7 computes normalized assessment averages weighted by assessment coefficients", () => {
  const result = calculateSubjectResult("MATH", marks, 4);
  assert.equal(result.average, 13.33);
  assert.equal(result.weightedPoints, 53.32);
  assert.equal(result.status, "COMPLETE");
});

test("P056.7 computes term average using subject coefficients, not assessment coefficients", () => {
  const result = calculateStudentTermResult({ studentId: "student-1", marks }, rules);
  assert.equal(result.average, 12.89);
  assert.equal(result.totalCoefficients, 6);
});

test("P056.7 treats pending marks as incomplete by default and excludes exempt assessments", () => {
  const result = calculateSubjectResult("MATH", [
    ...marks.slice(0, 1),
    { assessmentId: "m3", subjectCode: "MATH", score: null, maxScore: 20, assessmentCoefficient: 1, outcome: "PENDING" },
    { assessmentId: "m4", subjectCode: "MATH", score: null, maxScore: 20, assessmentCoefficient: 1, outcome: "EXEMPT" }
  ], 4);
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.average, null);
  assert.equal(result.exemptAssessments, 1);
});

test("P056.7 absent policy is explicit and defaults to exclusion", () => {
  const absent: AssessmentMark = { assessmentId: "a1", subjectCode: "MATH", score: null, maxScore: 20, assessmentCoefficient: 1, outcome: "ABSENT" };
  assert.equal(calculateSubjectResult("MATH", [absent], 4).status, "NO_GRADE");
  assert.equal(calculateSubjectResult("MATH", [absent], 4, { absentAsZero: true }).average, 0);
});

test("P056.7 ranks complete results with competition ranking and stable tie ordering", () => {
  const results = [
    calculateStudentTermResult({ studentId: "b", marks }, rules),
    calculateStudentTermResult({ studentId: "a", marks }, rules),
    calculateStudentTermResult({ studentId: "c", marks: [] }, rules)
  ];
  const ranked = rankTermResults(results);
  assert.deepEqual(ranked.map(x => [x.studentId, x.rank]), [["a", 1], ["b", 1], ["c", null]]);
});

test("P056.7 rejects duplicate assessment and student identities", () => {
  assert.throws(() => calculateSubjectResult("MATH", [marks[0]!, marks[0]!], 4), /EDUCATION_RESULT_DUPLICATE_ASSESSMENT/);
  const result = calculateStudentTermResult({ studentId: "same", marks }, rules);
  assert.throws(() => rankTermResults([result, result]), /EDUCATION_RESULT_DUPLICATE_STUDENT/);
});
