export type StudentLifecycle = "PROSPECT" | "APPLICANT" | "ADMITTED" | "ENROLLED" | "ACTIVE" | "SUSPENDED" | "WITHDRAWAL_PENDING" | "WITHDRAWN" | "ALUMNI";
export type WorkItemStatus = "OPEN" | "IN_PROGRESS" | "WAITING" | "BLOCKED" | "RESOLVED" | "CANCELLED";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "UNKNOWN";

export interface StudentState { studentId: string; organizationId: string; lifecycle: StudentLifecycle; version: bigint; }
export interface WorkItem { id: string; organizationId: string; status: WorkItemStatus; priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL"; dueAt: string | null; ownerActorId: string | null; version: bigint; }
export interface AttendanceRecord { studentId: string; classId: string; organizationId: string; status: AttendanceStatus; recordedBy: string; occurredAt: string; source: "TEACHER" | "AUTHORIZED_DEVICE" | "ADMIN_CORRECTION"; correctionReason?: string; version: bigint; }

const transitions: Record<StudentLifecycle, readonly StudentLifecycle[]> = {
  PROSPECT: ["APPLICANT", "WITHDRAWN"], APPLICANT: ["ADMITTED", "WITHDRAWN"], ADMITTED: ["ENROLLED", "WITHDRAWN"],
  ENROLLED: ["ACTIVE", "SUSPENDED", "WITHDRAWAL_PENDING"], ACTIVE: ["SUSPENDED", "WITHDRAWAL_PENDING"],
  SUSPENDED: ["ACTIVE", "WITHDRAWAL_PENDING"], WITHDRAWAL_PENDING: ["WITHDRAWN", "ACTIVE"], WITHDRAWN: ["ALUMNI"], ALUMNI: [],
};

export function assertStudentTransition(from: StudentLifecycle, to: StudentLifecycle): void {
  if (!transitions[from].includes(to)) throw new Error("INVALID_STUDENT_LIFECYCLE_TRANSITION");
}
export function transitionStudent(student: StudentState, to: StudentLifecycle): StudentState {
  assertStudentTransition(student.lifecycle, to);
  return { ...student, lifecycle: to, version: student.version + 1n };
}
export function claimWorkItem(item: WorkItem, actorId: string): WorkItem {
  if (item.ownerActorId !== null && item.ownerActorId !== actorId) throw new Error("WORK_ITEM_ALREADY_OWNED");
  if (item.status !== "OPEN" && item.status !== "WAITING") throw new Error("WORK_ITEM_NOT_CLAIMABLE");
  return { ...item, ownerActorId: actorId, status: "IN_PROGRESS", version: item.version + 1n };
}
export function resolveWorkItem(item: WorkItem, actorId: string): WorkItem {
  if (item.status !== "IN_PROGRESS") throw new Error("WORK_ITEM_NOT_IN_PROGRESS");
  if (item.ownerActorId !== actorId) throw new Error("WORK_ITEM_OWNER_REQUIRED");
  return { ...item, status: "RESOLVED", version: item.version + 1n };
}
export function reconcileAttendance(existing: AttendanceRecord | null, incoming: AttendanceRecord): AttendanceRecord {
  if (existing === null) return incoming;
  if (existing.organizationId !== incoming.organizationId) throw new Error("ATTENDANCE_CROSS_ORGANIZATION");
  if (incoming.version <= existing.version) throw new Error("ATTENDANCE_STALE_VERSION");
  if (existing.status !== incoming.status && incoming.source !== "ADMIN_CORRECTION") throw new Error("ATTENDANCE_CONFLICT_REQUIRES_AUTHORIZED_CORRECTION");
  if (incoming.source === "ADMIN_CORRECTION" && !incoming.correctionReason?.trim()) throw new Error("ATTENDANCE_CORRECTION_REASON_REQUIRED");
  return incoming;
}
export function operationalFreshness(lastEventAt: string | null, nowMs: number, staleAfterMs: number): "FRESH" | "STALE" | "UNKNOWN" {
  if (lastEventAt === null) return "UNKNOWN";
  const timestamp = Date.parse(lastEventAt);
  if (!Number.isFinite(timestamp)) return "UNKNOWN";
  return nowMs - timestamp > staleAfterMs ? "STALE" : "FRESH";
}
