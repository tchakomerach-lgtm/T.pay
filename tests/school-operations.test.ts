import test from "node:test";
import assert from "node:assert/strict";
import { transitionStudent, claimWorkItem, resolveWorkItem, reconcileAttendance, operationalFreshness } from "../packages/education/src/school-operations.js";

test("student lifecycle blocks illegal jumps", () => {
  const student = { studentId: "s1", organizationId: "o1", lifecycle: "ADMITTED" as const, version: 1n };
  assert.throws(() => transitionStudent(student, "ALUMNI"), /INVALID_STUDENT_LIFECYCLE_TRANSITION/);
  assert.equal(transitionStudent(student, "ENROLLED").version, 2n);
});
test("work ownership prevents silent reassignment", () => {
  const item = { id: "w1", organizationId: "o1", status: "OPEN" as const, priority: "HIGH" as const, dueAt: null, ownerActorId: null, version: 1n };
  const claimed = claimWorkItem(item, "actor-a");
  assert.throws(() => claimWorkItem(claimed, "actor-b"), /WORK_ITEM_ALREADY_OWNED/);
  assert.throws(() => resolveWorkItem(claimed, "actor-b"), /WORK_ITEM_OWNER_REQUIRED/);
  assert.equal(resolveWorkItem(claimed, "actor-a").status, "RESOLVED");
});
test("attendance correction is explicit and versioned", () => {
  const first = { studentId:"s1", classId:"c1", organizationId:"o1", status:"ABSENT" as const, recordedBy:"t1", occurredAt:"2026-10-07T08:00:00Z", source:"TEACHER" as const, version:1n };
  assert.throws(() => reconcileAttendance(first, {...first, status:"PRESENT", version:2n}), /ATTENDANCE_CONFLICT_REQUIRES_AUTHORIZED_CORRECTION/);
  assert.throws(() => reconcileAttendance(first, {...first, status:"PRESENT", version:2n, source:"ADMIN_CORRECTION"}), /ATTENDANCE_CORRECTION_REASON_REQUIRED/);
  const corrected = reconcileAttendance(first, {...first, status:"PRESENT", version:2n, source:"ADMIN_CORRECTION", correctionReason:"Présence confirmée"});
  assert.equal(corrected.status, "PRESENT");
});
test("operational freshness exposes stale data instead of pretending realtime", () => {
  const now = Date.parse("2026-10-07T10:00:00Z");
  assert.equal(operationalFreshness("2026-10-07T09:59:30Z", now, 60_000), "FRESH");
  assert.equal(operationalFreshness("2026-10-07T09:50:00Z", now, 60_000), "STALE");
  assert.equal(operationalFreshness(null, now, 60_000), "UNKNOWN");
});
