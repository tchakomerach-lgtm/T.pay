import { randomUUID } from "node:crypto";
import type { UUID } from "../../domain/src/types.js";
import type { TontineSqlExecutor } from "./tontine-repositories.js";

export type TontineReconciliationStatus = "matched" | "pending" | "mismatch" | "provider_only" | "ledger_only";
export interface TontineExternalRecord {
  provider: string; providerReference: string; groupId: UUID; contributionId?: UUID;
  amountMinor: bigint; currency: string; status: "pending" | "completed" | "failed" | "reversed";
}
export interface TontineInternalRecord {
  contributionId: UUID; groupId: UUID; amountMinor: bigint; currency: string;
  status: "pending" | "confirmed" | "missed" | "reversed";
}
export function reconcileTontinePayment(external: TontineExternalRecord | undefined, internal: TontineInternalRecord | undefined): TontineReconciliationStatus {
  if (external && !internal) return "provider_only";
  if (!external && internal) return "ledger_only";
  if (!external || !internal) return "pending";
  if (external.groupId !== internal.groupId || external.amountMinor !== internal.amountMinor || external.currency !== internal.currency) return "mismatch";
  if (external.status === "completed" && internal.status === "confirmed") return "matched";
  return "pending";
}

export type TontineFindingClass = "matched" | "callback_rejected" | "payout_intent_missing" | "amount_mismatch" | "currency_mismatch" | "payout_state_mismatch";
export type TontineFindingSeverity = "low" | "medium" | "high" | "critical";
export interface TontineReconciliationFinding {
  readonly id: UUID; readonly organizationId: UUID; readonly provider: string; readonly providerEventId: string;
  readonly payoutId: UUID | null; readonly classification: TontineFindingClass; readonly severity: TontineFindingSeverity;
  readonly callbackState: "received" | "processed" | "rejected" | "replayed"; readonly payoutState: string | null;
  readonly expectedAmountMinor: string | null; readonly observedAmountMinor: string | null;
  readonly expectedCurrency: string | null; readonly observedCurrency: string | null;
  readonly checkCount: number; readonly firstSeenAt: string; readonly lastCheckedAt: string; readonly resolvedAt: string | null;
}
type Row = Record<string, unknown>;

function classify(row: Row): { classification: TontineFindingClass; severity: TontineFindingSeverity } {
  if (row.callback_state === "rejected") return { classification: "callback_rejected", severity: "high" };
  if (row.callback_state !== "processed") return { classification: "payout_state_mismatch", severity: "medium" };
  if (row.payout_id == null || row.payout_state == null) return { classification: "payout_intent_missing", severity: "critical" };
  if (String(row.observed_amount_minor ?? "") !== String(row.expected_amount_minor ?? "")) return { classification: "amount_mismatch", severity: "critical" };
  if (String(row.observed_currency ?? "").trim() !== String(row.expected_currency ?? "").trim()) return { classification: "currency_mismatch", severity: "critical" };
  if (row.payout_state !== "confirmed") return { classification: "payout_state_mismatch", severity: "high" };
  return { classification: "matched", severity: "low" };
}
function mapFinding(row: Row): TontineReconciliationFinding {
  return {
    id: row.id as UUID, organizationId: row.organization_id as UUID, provider: String(row.provider),
    providerEventId: String(row.provider_event_id), payoutId: row.payout_id == null ? null : row.payout_id as UUID,
    classification: row.classification as TontineFindingClass, severity: row.severity as TontineFindingSeverity,
    callbackState: row.callback_state as TontineReconciliationFinding["callbackState"],
    payoutState: row.payout_state == null ? null : String(row.payout_state),
    expectedAmountMinor: row.expected_amount_minor == null ? null : String(row.expected_amount_minor),
    observedAmountMinor: row.observed_amount_minor == null ? null : String(row.observed_amount_minor),
    expectedCurrency: row.expected_currency == null ? null : String(row.expected_currency).trim(),
    observedCurrency: row.observed_currency == null ? null : String(row.observed_currency).trim(),
    checkCount: Number(row.check_count), firstSeenAt: new Date(String(row.first_seen_at)).toISOString(),
    lastCheckedAt: new Date(String(row.last_checked_at)).toISOString(),
    resolvedAt: row.resolved_at == null ? null : new Date(String(row.resolved_at)).toISOString()
  };
}

/** Durable comparison of a verified provider callback with the canonical payout intent.
 * It only records findings and Outbox events; it cannot mutate Financial Core or ledger state.
 */
export async function reconcileTontineProviderReceipt(
  db: TontineSqlExecutor, organizationId: UUID, provider: string, providerEventId: string, now: string
): Promise<TontineReconciliationFinding> {
  if (!provider.trim() || !providerEventId.trim()) throw new Error("TONTINE_RECONCILIATION_IDENTITY_REQUIRED");
  if (!Number.isFinite(Date.parse(now))) throw new Error("TONTINE_RECONCILIATION_TIMESTAMP_INVALID");
  return db.transaction(async tx => {
    const receipt = await tx.query<Row>(
      `SELECT r.organization_id,r.provider,r.provider_event_id,r.payout_id,r.state AS callback_state,
              r.amount_minor AS observed_amount_minor,r.currency AS observed_currency,
              p.state AS payout_state,p.amount_minor AS expected_amount_minor,p.currency AS expected_currency
       FROM tontine_provider_callback_receipts r
       LEFT JOIN payout_intents p ON p.organization_id=r.organization_id AND p.payout_id=r.payout_id
       WHERE r.organization_id=$1 AND r.provider=$2 AND r.provider_event_id=$3 FOR UPDATE OF r`,
      [organizationId,provider,providerEventId]
    );
    const source = receipt.rows[0];
    if (!source) throw new Error("TONTINE_CALLBACK_RECEIPT_NOT_FOUND");
    const outcome = classify(source);
    const previous = await tx.query<Row>(
      `SELECT id,classification FROM tontine_reconciliation_findings
       WHERE organization_id=$1 AND provider=$2 AND provider_event_id=$3 FOR UPDATE`,
      [organizationId,provider,providerEventId]
    );
    const existing = previous.rows[0];
    const findingId = (existing?.id ?? randomUUID()) as UUID;
    const changed = !existing || existing.classification !== outcome.classification;
    const persisted = await tx.query<Row>(
      `INSERT INTO tontine_reconciliation_findings
       (id,organization_id,provider,provider_event_id,payout_id,classification,severity,callback_state,payout_state,
        expected_amount_minor,observed_amount_minor,expected_currency,observed_currency,details,first_seen_at,last_checked_at,check_count,resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::timestamptz,$15::timestamptz,1,
        CASE WHEN $6='matched' THEN $15::timestamptz ELSE NULL END)
       ON CONFLICT (organization_id,provider,provider_event_id) DO UPDATE SET
        payout_id=EXCLUDED.payout_id,classification=EXCLUDED.classification,severity=EXCLUDED.severity,
        callback_state=EXCLUDED.callback_state,payout_state=EXCLUDED.payout_state,
        expected_amount_minor=EXCLUDED.expected_amount_minor,observed_amount_minor=EXCLUDED.observed_amount_minor,
        expected_currency=EXCLUDED.expected_currency,observed_currency=EXCLUDED.observed_currency,
        details=EXCLUDED.details,last_checked_at=EXCLUDED.last_checked_at,
        check_count=tontine_reconciliation_findings.check_count+1,
        resolved_at=CASE WHEN EXCLUDED.classification='matched' THEN EXCLUDED.last_checked_at ELSE NULL END
       RETURNING *`,
      [findingId,organizationId,provider,providerEventId,source.payout_id ?? null,outcome.classification,outcome.severity,
       source.callback_state,source.payout_state ?? null,source.expected_amount_minor ?? null,source.observed_amount_minor ?? null,
       source.expected_currency ?? null,source.observed_currency ?? null,JSON.stringify({classification:outcome.classification}),now]
    );
    const row = persisted.rows[0];
    if (!row) throw new Error("TONTINE_RECONCILIATION_PERSISTENCE_FAILED");
    if (changed && outcome.classification !== "matched") {
      await tx.query(
        `INSERT INTO outbox_events (id,organization_id,event_type,aggregate_id,occurred_at,payload)
         VALUES ($1,$2,'tontine.reconciliation.finding_changed',$3,$4::timestamptz,$5::jsonb) ON CONFLICT (id) DO NOTHING`,
        [randomUUID(),organizationId,row.id,now,JSON.stringify({findingId:row.id,provider,providerEventId,classification:outcome.classification,severity:outcome.severity})]
      );
    }
    return mapFinding(row);
  });
}
export async function listOpenTontineReconciliationFindings(db: TontineSqlExecutor, organizationId: UUID, limit=50): Promise<TontineReconciliationFinding[]> {
  if (!Number.isInteger(limit) || limit<1 || limit>200) throw new Error("TONTINE_RECONCILIATION_LIMIT_INVALID");
  const result=await db.query<Row>(
    `SELECT * FROM tontine_reconciliation_findings WHERE organization_id=$1 AND resolved_at IS NULL
     ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,first_seen_at ASC,id ASC LIMIT $2`,
    [organizationId,limit]
  );
  return result.rows.map(mapFinding);
}
