export type SyncPriority = "P0" | "P1" | "P2" | "P3";
export type SyncState = "PENDING" | "ACCEPTED" | "REJECTED" | "DUPLICATE" | "CONFLICTED" | "UNKNOWN";
export type DeviceState = "HEALTHY" | "DEGRADED" | "STALE" | "BACKLOGGED" | "CONFLICTED" | "UNTRUSTED" | "QUARANTINED" | "OFFLINE" | "RECOVERING" | "UNKNOWN";

export interface SyncEvent<T = unknown> {
  eventId: string;
  tenantId: string;
  organizationId: string;
  deviceId: string;
  actorId: string;
  sequence: bigint;
  occurredAt: string;
  eventType: string;
  priority: SyncPriority;
  payload: T;
  payloadHash: string;
  idempotencyKey: string;
  schemaVersion: number;
}

export interface SyncCursor { stream: string; sequence: bigint; }
export interface SyncConflict {
  conflictId: string;
  entityId: string;
  entityType: string;
  baseVersion: bigint;
  localVersion: bigint;
  serverVersion: bigint;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  resolution: "KEEP_SERVER" | "KEEP_LOCAL" | "MERGE" | "HUMAN_REVIEW";
}
export interface DeviceSyncHealth {
  state: DeviceState;
  pendingEvents: number;
  conflicts: number;
  rejectedEvents: number;
  lastSuccessfulSyncAt: string | null;
  clockDriftMs: number;
}

export function assertTenantScope(event: SyncEvent, expectedTenantId: string, expectedOrganizationId: string): void {
  if (event.tenantId !== expectedTenantId) throw new Error("SYNC_CROSS_TENANT");
  if (event.organizationId !== expectedOrganizationId) throw new Error("SYNC_CROSS_ORGANIZATION");
}

export function classifyDeviceHealth(input: Omit<DeviceSyncHealth, "state"> & { staleAfterMs: number; nowMs: number }): DeviceState {
  if (input.conflicts > 0) return "CONFLICTED";
  if (input.rejectedEvents > 0) return "DEGRADED";
  if (input.pendingEvents >= 1000) return "BACKLOGGED";
  if (input.lastSuccessfulSyncAt === null) return "UNKNOWN";
  const last = Date.parse(input.lastSuccessfulSyncAt);
  if (!Number.isFinite(last)) return "UNKNOWN";
  if (input.nowMs - last > input.staleAfterMs) return "STALE";
  return "HEALTHY";
}

export function shouldRetrySync(state: SyncState): boolean {
  return state === "PENDING" || state === "UNKNOWN";
}

export function isCriticalPriority(priority: SyncPriority): boolean {
  return priority === "P0";
}

export function validateEventEnvelope(event: SyncEvent): void {
  if (!event.eventId || !event.tenantId || !event.organizationId || !event.deviceId || !event.actorId) {
    throw new Error("SYNC_INVALID_IDENTITY");
  }
  if (event.sequence < 0n) throw new Error("SYNC_INVALID_SEQUENCE");
  if (!Number.isInteger(event.schemaVersion) || event.schemaVersion < 1) throw new Error("SYNC_INVALID_SCHEMA_VERSION");
  if (!/^([a-f0-9]{64})$/i.test(event.payloadHash)) throw new Error("SYNC_INVALID_PAYLOAD_HASH");
  if (!event.idempotencyKey || event.idempotencyKey.length < 12 || event.idempotencyKey.length > 256) {
    throw new Error("SYNC_INVALID_IDEMPOTENCY_KEY");
  }
  if (!Number.isFinite(Date.parse(event.occurredAt))) throw new Error("SYNC_INVALID_TIMESTAMP");
}

export function resolveConflict(conflict: SyncConflict, resolution: SyncConflict["resolution"]): SyncConflict {
  if (conflict.severity === "CRITICAL" && resolution !== "HUMAN_REVIEW") {
    throw new Error("SYNC_CRITICAL_CONFLICT_REQUIRES_HUMAN_REVIEW");
  }
  return { ...conflict, resolution };
}
