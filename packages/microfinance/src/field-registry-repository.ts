import { createHash, randomUUID } from "node:crypto";

export interface FieldRegistryQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
}
export interface FieldRegistryDb {
  query(sql: string, values?: unknown[]): Promise<FieldRegistryQueryResult>;
}
export type FieldVisitStatus =
  | "started" | "arrived" | "customer_confirmed" | "completed"
  | "customer_absent" | "location_mismatch" | "rescheduled" | "disputed" | "failed";

export interface OfflineFieldVisit {
  organizationId: string;
  customerId: string;
  routeId?: string;
  authorizedAgentId: string;
  trustedDeviceId: string;
  visitStatus: FieldVisitStatus;
  eventSequence: number;
  idempotencyKey: string;
  eventAt: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  correlationId: string;
}
export type FieldVisitWriteResult = {
  outcome: "accepted" | "replayed";
  event: Record<string, unknown>;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const KEY = /^[A-Za-z0-9._:-]{12,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set<FieldVisitStatus>([
  "started", "arrived", "customer_confirmed", "completed", "customer_absent",
  "location_mismatch", "rescheduled", "disputed", "failed",
]);

function requiredUuid(value: string, field: string): void {
  if (!UUID.test(value)) throw new Error("FIELD_REGISTRY_INVALID_" + field.toUpperCase());
}
function canonicalVisit(input: OfflineFieldVisit): string {
  return JSON.stringify({
    organizationId: input.organizationId,
    customerId: input.customerId,
    routeId: input.routeId ?? null,
    authorizedAgentId: input.authorizedAgentId,
    trustedDeviceId: input.trustedDeviceId,
    visitStatus: input.visitStatus,
    eventSequence: input.eventSequence,
    eventAt: new Date(input.eventAt).toISOString(),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    accuracyMeters: input.accuracyMeters ?? null,
    // Correlation IDs are per-request observability metadata, not visit evidence.
    // Excluding them lets a legitimate retry retain the same evidence hash.
  });
}
function validateVisit(input: OfflineFieldVisit): void {
  requiredUuid(input.organizationId, "organization_id");
  requiredUuid(input.customerId, "customer_id");
  requiredUuid(input.authorizedAgentId, "agent_id");
  requiredUuid(input.trustedDeviceId, "device_id");
  requiredUuid(input.correlationId, "correlation_id");
  if (input.routeId) requiredUuid(input.routeId, "route_id");
  if (!KEY.test(input.idempotencyKey)) throw new Error("FIELD_VISIT_IDEMPOTENCY_KEY_INVALID");
  if (!Number.isSafeInteger(input.eventSequence) || input.eventSequence < 1) throw new Error("FIELD_VISIT_SEQUENCE_INVALID");
  if (!statuses.has(input.visitStatus)) throw new Error("FIELD_VISIT_STATUS_INVALID");
  if (!Number.isFinite(Date.parse(input.eventAt))) throw new Error("FIELD_VISIT_TIMESTAMP_INVALID");
  if (input.latitude !== undefined && (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90)) throw new Error("FIELD_VISIT_LATITUDE_INVALID");
  if (input.longitude !== undefined && (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180)) throw new Error("FIELD_VISIT_LONGITUDE_INVALID");
  if (input.accuracyMeters !== undefined && (!Number.isFinite(input.accuracyMeters) || input.accuracyMeters < 0)) throw new Error("FIELD_VISIT_ACCURACY_INVALID");
  if ((input.latitude === undefined) !== (input.longitude === undefined)) throw new Error("FIELD_VISIT_COORDINATES_INCOMPLETE");
}

/**
 * Tenant-scoped persistence for field routes and offline visit events.
 * It deliberately has no Ledger/payment dependency. Agent and device IDs must
 * be resolved from the authenticated server-side session, never from the body.
 */
export class PostgresFieldRegistryRepository {
  constructor(private readonly db: FieldRegistryDb) {}

  async listRoutes(organizationId: string): Promise<Record<string, unknown>[]> {
    requiredUuid(organizationId, "organization_id");
    const result = await this.db.query(
      "SELECT route_id, route_code, name, zone_code, status, version, created_at FROM customer_field_routes WHERE organization_id = $1 AND status <> 'retired' ORDER BY zone_code, route_code",
      [organizationId],
    );
    return result.rows;
  }

  async listVisits(input: { organizationId: string; routeId?: string; after?: string; limit?: number }): Promise<Record<string, unknown>[]> {
    requiredUuid(input.organizationId, "organization_id");
    if (input.routeId) requiredUuid(input.routeId, "route_id");
    if (input.after !== undefined && !Number.isFinite(Date.parse(input.after))) throw new Error("FIELD_VISIT_CURSOR_INVALID");
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("FIELD_VISIT_LIMIT_INVALID");
    const result = await this.db.query(
      "SELECT id, customer_id, route_id, agent_id, device_id, visit_status, event_sequence, event_at, latitude, longitude, accuracy_meters, correlation_id FROM customer_field_visit_events WHERE organization_id = $1 AND ($2::uuid IS NULL OR route_id = $2) AND ($3::timestamptz IS NULL OR event_at > $3::timestamptz) ORDER BY event_at, device_id, event_sequence LIMIT $4",
      [input.organizationId, input.routeId ?? null, input.after ?? null, limit],
    );
    return result.rows;
  }

  async recordOfflineVisit(input: OfflineFieldVisit): Promise<FieldVisitWriteResult> {
    validateVisit(input);
    const evidenceHash = sha256(canonicalVisit(input));
    const lookup = () => this.db.query(
      "SELECT id, idempotency_key, evidence_hash FROM customer_field_visit_events WHERE organization_id = $1 AND (idempotency_key = $2 OR (device_id = $3 AND event_sequence = $4)) LIMIT 1",
      [input.organizationId, input.idempotencyKey, input.trustedDeviceId, input.eventSequence],
    );
    const prior = await lookup();
    if (prior.rows.length) return this.resolveReplay(prior.rows[0]!, input.idempotencyKey, evidenceHash);

    const inserted = await this.db.query(
      `INSERT INTO customer_field_visit_events
        (id, organization_id, customer_id, route_id, agent_id, device_id, visit_status,
         event_sequence, idempotency_key, event_at, latitude, longitude, accuracy_meters,
         evidence_hash, correlation_id)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11,$12,$13,$14,$15
       WHERE EXISTS (
         SELECT 1 FROM customer_field_assignments a
         WHERE a.organization_id = $2 AND a.customer_id = $3 AND a.agent_id = $5
           AND ($4::uuid IS NULL OR a.route_id = $4)
           AND a.status IN ('active','ended') AND a.valid_from <= $10::timestamptz
           AND (a.valid_until IS NULL OR a.valid_until >= $10::timestamptz)
       )
       ON CONFLICT DO NOTHING
       RETURNING id, organization_id, customer_id, route_id, agent_id, device_id,
         visit_status, event_sequence, event_at, latitude, longitude, accuracy_meters,
         correlation_id, evidence_hash`,
      [
        randomUUID(), input.organizationId, input.customerId, input.routeId ?? null,
        input.authorizedAgentId, input.trustedDeviceId, input.visitStatus, input.eventSequence,
        input.idempotencyKey, new Date(input.eventAt).toISOString(), input.latitude ?? null,
        input.longitude ?? null, input.accuracyMeters ?? null, evidenceHash, input.correlationId,
      ],
    );
    if (inserted.rows.length) return { outcome: "accepted", event: inserted.rows[0]! };

    // A concurrent request may have won either unique constraint after the first lookup.
    const raced = await lookup();
    if (raced.rows.length) return this.resolveReplay(raced.rows[0]!, input.idempotencyKey, evidenceHash);
    throw new Error("FIELD_VISIT_ASSIGNMENT_NOT_VALID_AT_EVENT_TIME");
  }

  private resolveReplay(row: Record<string, unknown>, key: string, evidenceHash: string): FieldVisitWriteResult {
    if (row.idempotency_key !== key || row.evidence_hash !== evidenceHash) {
      throw new Error("FIELD_VISIT_IDEMPOTENCY_CONFLICT");
    }
    return { outcome: "replayed", event: row };
  }
}
