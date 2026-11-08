import { createHash } from "node:crypto";
import type { RankedTermResult, SubjectResult } from "./term-results.js";

export interface BulletinStudentIdentity {
  studentId: string;
  studentNumber: string;
  displayName: string;
}
export interface BulletinOrganizationBrand {
  organizationName: string;
  logoAssetId: string | null;
  primaryColor: string;
}
export interface BulletinTemplateRef {
  templateId: string;
  version: number;
  locale: string;
}
export interface BulletinContext {
  organizationId: string;
  academicYear: string;
  periodCode: string;
  periodLabel: string;
  classId: string;
  classLabel: string;
  issuedAt: string;
}
export interface BulletinSnapshotInput {
  result: RankedTermResult;
  student: BulletinStudentIdentity;
  brand: BulletinOrganizationBrand;
  template: BulletinTemplateRef;
  context: BulletinContext;
  gradingScale?: number;
}
export interface BulletinSnapshotSubject {
  subjectCode: string;
  average: number;
  coefficient: number;
  weightedPoints: number;
  status: "COMPLETE";
}
export interface BulletinSnapshot {
  schemaVersion: 1;
  contentHash: string;
  student: Readonly<BulletinStudentIdentity>;
  brand: Readonly<BulletinOrganizationBrand>;
  template: Readonly<BulletinTemplateRef>;
  context: Readonly<BulletinContext>;
  result: Readonly<{
    average: number;
    rank: number | null;
    totalCoefficients: number;
    gradingScale: number;
    subjects: readonly Readonly<BulletinSnapshotSubject>[];
  }>;
}

const clean = (value: string, max: number, code: string): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(code);
  return normalized;
};
const validDateTime = (value: string): boolean =>
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map(key => JSON.stringify(key) + ":" + canonical(record[key])).join(",") + "}";
}
function hashSnapshot(value: Omit<BulletinSnapshot, "contentHash">): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function validateSubject(subject: SubjectResult): BulletinSnapshotSubject {
  if (subject.status !== "COMPLETE" || subject.average === null ||
      !Number.isFinite(subject.average) || subject.average < 0 ||
      !Number.isFinite(subject.coefficient) || subject.coefficient <= 0 ||
      !Number.isFinite(subject.weightedPoints)) {
    throw new Error("EDUCATION_BULLETIN_SUBJECT_RESULT_INCOMPLETE");
  }
  return Object.freeze({
    subjectCode: clean(subject.subjectCode, 32, "EDUCATION_BULLETIN_SUBJECT_INVALID"),
    average: round2(subject.average),
    coefficient: subject.coefficient,
    weightedPoints: round2(subject.weightedPoints),
    status: "COMPLETE" as const
  });
}

/**
 * Creates a deterministic, self-contained academic document snapshot.
 * Persistence, publication and revocation are handled by the transactional API.
 * This function never reads or mutates a database and never handles school fees.
 */
export function createBulletinSnapshot(input: BulletinSnapshotInput): BulletinSnapshot {
  const { result } = input;
  if (result.status !== "COMPLETE" || result.average === null ||
      !Number.isFinite(result.average) || result.average < 0 ||
      !Number.isFinite(result.totalCoefficients) || result.totalCoefficients <= 0 ||
      !Number.isSafeInteger(result.rank ?? 1) || (result.rank !== null && result.rank < 1)) {
    throw new Error("EDUCATION_BULLETIN_TERM_RESULT_INCOMPLETE");
  }
  const gradingScale = input.gradingScale ?? 20;
  if (!Number.isFinite(gradingScale) || gradingScale <= 0 || gradingScale > 1000) {
    throw new Error("EDUCATION_BULLETIN_SCALE_INVALID");
  }
  if (!/^\d{4}-\d{4}$/.test(input.context.academicYear) ||
      Number(input.context.academicYear.slice(5)) !== Number(input.context.academicYear.slice(0, 4)) + 1) {
    throw new Error("EDUCATION_BULLETIN_ACADEMIC_YEAR_INVALID");
  }
  if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(input.context.periodCode)) {
    throw new Error("EDUCATION_BULLETIN_PERIOD_INVALID");
  }
  if (!validDateTime(input.context.issuedAt)) throw new Error("EDUCATION_BULLETIN_ISSUED_AT_INVALID");
  if (!Number.isSafeInteger(input.template.version) || input.template.version < 1) {
    throw new Error("EDUCATION_BULLETIN_TEMPLATE_VERSION_INVALID");
  }
  if (input.brand.logoAssetId !== null &&
      !/^[A-Za-z0-9._:-]{1,128}$/.test(input.brand.logoAssetId)) {
    throw new Error("EDUCATION_BULLETIN_LOGO_ASSET_INVALID");
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(input.brand.primaryColor)) {
    throw new Error("EDUCATION_BULLETIN_BRAND_COLOR_INVALID");
  }
  const subjects = result.subjects.map(validateSubject)
    .sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
  if (subjects.length === 0 || new Set(subjects.map(s => s.subjectCode)).size !== subjects.length) {
    throw new Error("EDUCATION_BULLETIN_SUBJECT_SET_INVALID");
  }
  const snapshotBase = {
    schemaVersion: 1 as const,
    student: Object.freeze({
      studentId: clean(input.student.studentId, 128, "EDUCATION_BULLETIN_STUDENT_ID_REQUIRED"),
      studentNumber: clean(input.student.studentNumber, 64, "EDUCATION_BULLETIN_STUDENT_NUMBER_REQUIRED"),
      displayName: clean(input.student.displayName, 160, "EDUCATION_BULLETIN_STUDENT_NAME_REQUIRED")
    }),
    brand: Object.freeze({
      organizationName: clean(input.brand.organizationName, 160, "EDUCATION_BULLETIN_ORG_NAME_REQUIRED"),
      logoAssetId: input.brand.logoAssetId,
      primaryColor: input.brand.primaryColor.toUpperCase()
    }),
    template: Object.freeze({
      templateId: clean(input.template.templateId, 128, "EDUCATION_BULLETIN_TEMPLATE_REQUIRED"),
      version: input.template.version,
      locale: clean(input.template.locale, 32, "EDUCATION_BULLETIN_LOCALE_REQUIRED")
    }),
    context: Object.freeze({
      organizationId: clean(input.context.organizationId, 128, "EDUCATION_BULLETIN_ORG_REQUIRED"),
      academicYear: input.context.academicYear,
      periodCode: input.context.periodCode,
      periodLabel: clean(input.context.periodLabel, 80, "EDUCATION_BULLETIN_PERIOD_LABEL_REQUIRED"),
      classId: clean(input.context.classId, 128, "EDUCATION_BULLETIN_CLASS_REQUIRED"),
      classLabel: clean(input.context.classLabel, 120, "EDUCATION_BULLETIN_CLASS_LABEL_REQUIRED"),
      issuedAt: input.context.issuedAt
    }),
    result: Object.freeze({
      average: round2(result.average),
      rank: result.rank,
      totalCoefficients: result.totalCoefficients,
      gradingScale,
      subjects: Object.freeze(subjects)
    })
  };
  const contentHash = hashSnapshot(snapshotBase);
  return Object.freeze({ ...snapshotBase, contentHash });
}
