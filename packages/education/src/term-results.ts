export type GradeOutcome = "GRADED" | "ABSENT" | "EXEMPT" | "PENDING";

export interface AssessmentMark {
  assessmentId: string;
  subjectCode: string;
  score: number | null;
  maxScore: number;
  assessmentCoefficient: number;
  outcome: GradeOutcome;
}
export interface SubjectRule {
  subjectCode: string;
  coefficient: number;
}
export interface StudentAssessmentSet {
  studentId: string;
  marks: readonly AssessmentMark[];
}
export interface TermResultPolicy {
  targetScale?: number;
  absentAsZero?: boolean;
  requireAllAssessments?: boolean;
}
export interface SubjectResult {
  subjectCode: string;
  average: number | null;
  coefficient: number;
  completedAssessments: number;
  absentAssessments: number;
  exemptAssessments: number;
  pendingAssessments: number;
  weightedPoints: number;
  status: "COMPLETE" | "INCOMPLETE" | "NO_GRADE";
}
export interface StudentTermResult {
  studentId: string;
  average: number | null;
  totalCoefficients: number;
  subjects: SubjectResult[];
  status: "COMPLETE" | "INCOMPLETE" | "NO_GRADE";
}
export interface RankedTermResult extends StudentTermResult {
  rank: number | null;
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const assertFinitePositive = (value: number, code: string): void => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(code);
};

export function calculateSubjectResult(
  subjectCode: string,
  marks: readonly AssessmentMark[],
  subjectCoefficient: number,
  policy: TermResultPolicy = {}
): SubjectResult {
  if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(subjectCode)) throw new Error("EDUCATION_RESULT_SUBJECT_INVALID");
  assertFinitePositive(subjectCoefficient, "EDUCATION_RESULT_SUBJECT_COEFFICIENT_INVALID");
  const targetScale = policy.targetScale ?? 20;
  assertFinitePositive(targetScale, "EDUCATION_RESULT_TARGET_SCALE_INVALID");
  const seen = new Set<string>();
  let weighted = 0, totalWeight = 0, completed = 0, absent = 0, exempt = 0, pending = 0;
  for (const mark of marks) {
    if (mark.subjectCode !== subjectCode) continue;
    if (!mark.assessmentId.trim() || seen.has(mark.assessmentId)) throw new Error("EDUCATION_RESULT_DUPLICATE_ASSESSMENT");
    seen.add(mark.assessmentId);
    assertFinitePositive(mark.maxScore, "EDUCATION_RESULT_MAX_SCORE_INVALID");
    assertFinitePositive(mark.assessmentCoefficient, "EDUCATION_RESULT_ASSESSMENT_COEFFICIENT_INVALID");
    if (mark.outcome === "PENDING") { pending++; continue; }
    if (mark.outcome === "EXEMPT") { exempt++; continue; }
    if (mark.outcome === "ABSENT") {
      absent++;
      if (!policy.absentAsZero) continue;
      weighted += 0;
      totalWeight += mark.assessmentCoefficient;
      completed++;
      continue;
    }
    if (mark.outcome !== "GRADED" || mark.score === null ||
        !Number.isFinite(mark.score) || mark.score < 0 || mark.score > mark.maxScore) {
      throw new Error("EDUCATION_RESULT_SCORE_INVALID");
    }
    weighted += (mark.score / mark.maxScore) * targetScale * mark.assessmentCoefficient;
    totalWeight += mark.assessmentCoefficient;
    completed++;
  }
  const incomplete = (policy.requireAllAssessments ?? true) && pending > 0;
  const average = totalWeight > 0 ? round2(weighted / totalWeight) : null;
  const status = incomplete ? "INCOMPLETE" : average === null ? "NO_GRADE" : "COMPLETE";
  return {
    subjectCode, average: status === "COMPLETE" ? average : null,
    coefficient: subjectCoefficient, completedAssessments: completed,
    absentAssessments: absent, exemptAssessments: exempt, pendingAssessments: pending,
    weightedPoints: status === "COMPLETE" && average !== null ? round2(average * subjectCoefficient) : 0,
    status
  };
}

export function calculateStudentTermResult(
  input: StudentAssessmentSet,
  subjectRules: readonly SubjectRule[],
  policy: TermResultPolicy = {}
): StudentTermResult {
  if (!input.studentId.trim()) throw new Error("EDUCATION_RESULT_STUDENT_REQUIRED");
  const codes = new Set<string>();
  for (const rule of subjectRules) {
    if (codes.has(rule.subjectCode)) throw new Error("EDUCATION_RESULT_DUPLICATE_SUBJECT_RULE");
    codes.add(rule.subjectCode);
  }
  const subjects = subjectRules.map(rule =>
    calculateSubjectResult(rule.subjectCode, input.marks, rule.coefficient, policy)
  );
  const incomplete = subjects.some(subject => subject.status === "INCOMPLETE");
  const graded = subjects.filter(subject => subject.status === "COMPLETE" && subject.average !== null);
  const totalCoefficients = graded.reduce((sum, subject) => sum + subject.coefficient, 0);
  const average = totalCoefficients > 0
    ? round2(graded.reduce((sum, subject) => sum + (subject.average ?? 0) * subject.coefficient, 0) / totalCoefficients)
    : null;
  const status = incomplete ? "INCOMPLETE" : average === null ? "NO_GRADE" : "COMPLETE";
  return { studentId: input.studentId, average: status === "COMPLETE" ? average : null, totalCoefficients, subjects, status };
}

export function rankTermResults(results: readonly StudentTermResult[]): RankedTermResult[] {
  const ids = new Set<string>();
  for (const result of results) {
    if (ids.has(result.studentId)) throw new Error("EDUCATION_RESULT_DUPLICATE_STUDENT");
    ids.add(result.studentId);
  }
  const ordered = [...results].sort((a, b) => {
    if (a.average === null && b.average !== null) return 1;
    if (a.average !== null && b.average === null) return -1;
    return (b.average ?? -1) - (a.average ?? -1) || a.studentId.localeCompare(b.studentId);
  });
  let previous: number | null = null, previousRank = 0;
  return ordered.map((result, index) => {
    if (result.status !== "COMPLETE" || result.average === null) return { ...result, rank: null };
    const rank = previous === result.average ? previousRank : index + 1;
    previous = result.average;
    previousRank = rank;
    return { ...result, rank };
  });
}
