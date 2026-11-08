export interface AssessmentInput {
  classId: string;
  academicYear: string;
  subjectCode: string;
  periodCode: string;
  title: string;
  assessmentDate: string;
  maxScore: number;
  coefficient: number;
}
export interface GradeInput {
  enrollmentId: string;
  score: number;
  teacherComment?: string | null;
  expectedVersion?: number;
}
export type AssessmentStatus = "OPEN" | "LOCKED";

const validDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export function validateAssessmentInput(input: AssessmentInput): AssessmentInput {
  if (!input.classId.trim() || input.classId.length > 128) throw new Error("EDUCATION_ASSESSMENT_CLASS_REQUIRED");
  if (!/^\d{4}-\d{4}$/.test(input.academicYear) ||
      Number(input.academicYear.slice(5)) !== Number(input.academicYear.slice(0, 4)) + 1) {
    throw new Error("EDUCATION_ACADEMIC_YEAR_INVALID");
  }
  if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(input.subjectCode)) throw new Error("EDUCATION_SUBJECT_CODE_INVALID");
  if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(input.periodCode)) throw new Error("EDUCATION_ASSESSMENT_PERIOD_INVALID");
  if (!input.title.trim() || input.title.trim().length > 160) throw new Error("EDUCATION_ASSESSMENT_TITLE_INVALID");
  if (!validDate(input.assessmentDate)) throw new Error("EDUCATION_ASSESSMENT_DATE_INVALID");
  if (!Number.isFinite(input.maxScore) || input.maxScore <= 0 || input.maxScore > 1000) {
    throw new Error("EDUCATION_ASSESSMENT_MAX_SCORE_INVALID");
  }
  if (!Number.isFinite(input.coefficient) || input.coefficient <= 0 || input.coefficient > 100) {
    throw new Error("EDUCATION_ASSESSMENT_COEFFICIENT_INVALID");
  }
  return { ...input, classId: input.classId.trim(), title: input.title.trim() };
}
export function validateGradeInput(input: GradeInput, maxScore: number): GradeInput {
  if (!input.enrollmentId.trim() || input.enrollmentId.length > 128) throw new Error("EDUCATION_GRADE_ENROLLMENT_REQUIRED");
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > maxScore) throw new Error("EDUCATION_GRADE_SCORE_OUT_OF_RANGE");
  if (input.teacherComment != null && input.teacherComment.length > 1000) throw new Error("EDUCATION_GRADE_COMMENT_TOO_LONG");
  if (input.expectedVersion !== undefined &&
      (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)) {
    throw new Error("EDUCATION_GRADE_VERSION_INVALID");
  }
  return input;
}
export function normalizeGrade(score: number, maxScore: number, targetScale = 20): number {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || !Number.isFinite(targetScale) ||
      maxScore <= 0 || targetScale <= 0 || score < 0 || score > maxScore) {
    throw new Error("EDUCATION_GRADE_NORMALIZATION_INVALID");
  }
  return Math.round((score / maxScore) * targetScale * 100) / 100;
}
export function lockAssessment(status: AssessmentStatus): AssessmentStatus {
  if (status !== "OPEN") throw new Error("EDUCATION_ASSESSMENT_ALREADY_LOCKED");
  return "LOCKED";
}
