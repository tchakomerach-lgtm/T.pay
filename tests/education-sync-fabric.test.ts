import test from "node:test";
import assert from "node:assert/strict";
import {
  assertTenantScope,
  classifyDeviceHealth,
  resolveConflict,
  validateEventEnvelope,
  shouldRetrySync,
} from "../packages/education/src/sync-fabric.js";

const baseEvent = {
  eventId: "evt-1",
  tenantId: "tenant-a",
  organizationId: "school-a",
  deviceId: "device-a",
  actorId: "actor-a",
  sequence: 1n,
  occurredAt: "2026-10-07T10:00:00.000Z",
  eventType: "attendance.recorded",
  priority: "P1" as const,
  payload: { studentId: "s1", status: "present" },
  payloadHash: "a".repeat(64),
  idempotencyKey: "sync-idem-123456",
  schemaVersion: 1,
};

test("sync envelope validates deterministic required fields", () => {
  assert.doesNotThrow(() => validateEventEnvelope(baseEvent));
  assert.throws(() => validateEventEnvelope({ ...baseEvent, payloadHash: "bad" }), /SYNC_INVALID_PAYLOAD_HASH/);
  assert.throws(() => validateEventEnvelope({ ...baseEvent, sequence: -1n }), /SYNC_INVALID_SEQUENCE/);
});

test("sync rejects cross-tenant and cross-organization events", () => {
  assert.throws(() => assertTenantScope(baseEvent, "tenant-b", "school-a"), /SYNC_CROSS_TENANT/);
  assert.throws(() => assertTenantScope(baseEvent, "tenant-a", "school-b"), /SYNC_CROSS_ORGANIZATION/);
});

test("critical conflicts cannot be auto-resolved", () => {
  const conflict = {
    conflictId: "c1",
    entityId: "student-1",
    entityType: "student",
    baseVersion: 1n,
    localVersion: 2n,
    serverVersion: 2n,
    severity: "CRITICAL" as const,
    resolution: "HUMAN_REVIEW" as const,
  };
  assert.throws(() => resolveConflict(conflict, "KEEP_SERVER"), /SYNC_CRITICAL_CONFLICT_REQUIRES_HUMAN_REVIEW/);
  assert.equal(resolveConflict(conflict, "HUMAN_REVIEW").resolution, "HUMAN_REVIEW");
});

test("device health exposes stale and backlog conditions", () => {
  assert.equal(classifyDeviceHealth({
    pendingEvents: 0, conflicts: 0, rejectedEvents: 0,
    lastSuccessfulSyncAt: "2026-10-07T09:00:00.000Z",
    clockDriftMs: 0, staleAfterMs: 60_000, nowMs: Date.parse("2026-10-07T09:02:00.000Z")
  }), "STALE");
  assert.equal(classifyDeviceHealth({
    pendingEvents: 1000, conflicts: 0, rejectedEvents: 0,
    lastSuccessfulSyncAt: "2026-10-07T10:00:00.000Z",
    clockDriftMs: 0, staleAfterMs: 60_000, nowMs: Date.parse("2026-10-07T10:00:01.000Z")
  }), "BACKLOGGED");
});

test("unknown sync is retryable, rejected is not", () => {
  assert.equal(shouldRetrySync("UNKNOWN"), true);
  assert.equal(shouldRetrySync("REJECTED"), false);
});
