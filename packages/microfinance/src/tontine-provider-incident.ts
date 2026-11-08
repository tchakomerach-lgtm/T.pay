import { createHash } from "node:crypto";
import type { UUID } from "../../domain/src/types.js";
import type { TontineSqlExecutor } from "./tontine-repositories.js";

export interface TontineProviderIncidentInput {
  readonly organizationId: UUID;
  readonly cycleId: string;
  readonly provider: string;
  readonly providerEventId: string;
  readonly rawBody: string;
  readonly occurredAt: string;
  readonly reason: "CALLBACK_PAYLOAD_MISMATCH" | "PAYOUT_INTENT_NOT_FOUND" | "PAYOUT_NOT_APPROVED";
}

export interface TontineProviderIncidentResult {
  readonly caseId: UUID | null;
  readonly created: boolean;
}

function deterministicUuid(namespace: string, value: string): UUID {
  const hex = createHash("sha256").update(namespace + "|" + value, "utf8").digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16] ?? "8", 16) % 4] ?? "8";
  return `${hex.slice(0,8).join("")}-${hex.slice(8,12).join("")}-${hex.slice(12,16).join("")}-${hex.slice(16,20).join("")}-${hex.slice(20).join("")}` as UUID;
}

/**
 * Creates one durable incident per verified provider event.
 * The caller must pass the existing callback transaction so case, evidence and
 * outbox event commit or roll back together. Raw provider bodies are never persisted.
 */
export async function recordTontineProviderIncident(
  tx: TontineSqlExecutor,
  input: TontineProviderIncidentInput
): Promise<TontineProviderIncidentResult> {
  if (!input.provider.trim() || !input.providerEventId.trim() || !input.rawBody) {
    throw new Error("TONTINE_PROVIDER_INCIDENT_IDENTITY_INVALID");
  }
  const cycle = await tx.query<{ group_id: UUID }>(
    "SELECT group_id FROM tontine_cycles WHERE organization_id=$1 AND id=$2",
    [input.organizationId, input.cycleId]
  );
  const groupId = cycle.rows[0]?.group_id;
  // A missing cycle is not grounds to invent a group or actor. The callback
  // rejection remains durable; a separate reconciliation queue handles orphan references.
  if (!groupId) return { caseId: null, created: false };

  const sourceEventKey = createHash("sha256")
    .update(["tpay:tontine:provider-incident:v1", input.provider, input.providerEventId].join("|"), "utf8")
    .digest("hex");
  const caseId = deterministicUuid("tpay:tontine:case:v1", input.organizationId + "|" + sourceEventKey);
  const evidenceId = deterministicUuid("tpay:tontine:evidence:v1", input.organizationId + "|" + sourceEventKey);
  const outboxId = deterministicUuid("tpay:tontine:outbox:v1", input.organizationId + "|" + sourceEventKey);
  const contentHash = createHash("sha256").update(input.rawBody, "utf8").digest("hex");

  const inserted = await tx.query<{ id: UUID }>(
    `INSERT INTO tontine_cases
      (id,organization_id,group_id,type,state,opened_by,opened_by_system,source_event_key,
       severity,summary,created_at,updated_at)
     VALUES ($1,$2,$3,'incident','opened',NULL,true,$4,'high',$5,$6::timestamptz,$6::timestamptz)
     ON CONFLICT (organization_id,source_event_key)
       WHERE source_event_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [caseId,input.organizationId,groupId,sourceEventKey,
     "Provider callback rejected: " + input.reason,input.occurredAt]
  );
  if (inserted.rows.length === 0) {
    const existing = await tx.query<{ id: UUID }>(
      "SELECT id FROM tontine_cases WHERE organization_id=$1 AND source_event_key=$2",
      [input.organizationId,sourceEventKey]
    );
    return { caseId: existing.rows[0]?.id ?? null, created: false };
  }

  await tx.query(
    `INSERT INTO tontine_case_evidence
      (id,organization_id,case_id,type,content_hash,object_reference,captured_by,captured_at)
     VALUES ($1,$2,$3,'provider_callback',$4,$5,$2,$6::timestamptz)
     ON CONFLICT (organization_id,case_id,content_hash) DO NOTHING`,
    [evidenceId,input.organizationId,caseId,contentHash,
     "provider-event:" + input.provider + ":" + input.providerEventId,input.occurredAt]
  );

  await tx.query(
    `INSERT INTO outbox_events
      (id,organization_id,event_type,aggregate_id,occurred_at,payload)
     VALUES ($1,$2,'tontine.provider_incident.opened',$3,$4::timestamptz,$5::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [outboxId,input.organizationId,caseId,input.occurredAt,
     JSON.stringify({ caseId, provider: input.provider, providerEventId: input.providerEventId, reason: input.reason })]
  );
  return { caseId, created: true };
}
