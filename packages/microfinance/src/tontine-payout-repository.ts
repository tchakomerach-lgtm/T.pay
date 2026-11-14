import type { UUID } from "../../domain/src/types.js";
import type { PayoutApproval, PayoutIntent } from "../../finance/src/payout.js";
import type { TontinePayoutPlan } from "./tontine-payout.js";
import type { TontineSqlExecutor } from "./tontine-repositories.js";

export interface PersistedTontinePayout {
  readonly intent: PayoutIntent;
  readonly beneficiaryMembershipId: UUID;
  readonly microfinanceId: UUID;
  readonly tontineSlotId: UUID;
  readonly provider?: string;
  readonly providerReference?: string;
  readonly settlementTransactionId?: UUID;
}

type PayoutRow = Record<string, unknown>;

function toPayout(row: PayoutRow): PersistedTontinePayout {
  return {
    intent: {
      payoutId: String(row.payout_id),
      organizationId: String(row.organization_id),
      cycleId: String(row.cycle_id),
      beneficiaryId: String(row.beneficiary_id),
      amountMinor: BigInt(String(row.amount_minor)),
      currency: String(row.currency),
      destinationRef: String(row.destination_ref),
      state: row.state as PayoutIntent["state"],
      idempotencyKey: String(row.idempotency_key),
      requiresHumanApproval: Boolean(row.requires_human_approval),
      kycVerified: Boolean(row.kyc_verified),
      createdAt: new Date(String(row.created_at)).toISOString()
    },
    beneficiaryMembershipId: String(row.beneficiary_membership_id) as UUID,
    microfinanceId: String(row.microfinance_id) as UUID,
    tontineSlotId: String(row.tontine_slot_id) as UUID,
    ...(row.provider == null ? {} : { provider: String(row.provider) }),
    ...(row.provider_reference == null ? {} : { providerReference: String(row.provider_reference) }),
    ...(row.settlement_transaction_id == null ? {} : { settlementTransactionId: String(row.settlement_transaction_id) as UUID })
  };
}

const SELECT_PAYOUT = `
  SELECT pi.payout_id,pi.organization_id,pi.cycle_id,pi.beneficiary_id,pi.amount_minor::text AS amount_minor,
         pi.currency,pi.destination_ref,pi.state,pi.idempotency_key,pi.requires_human_approval,
         pi.kyc_verified,pi.created_at,pi.provider,pi.provider_reference,pi.settlement_transaction_id,
         slot.beneficiary_membership_id,slot.id AS tontine_slot_id,
         membership.selected_microfinance_id AS microfinance_id
  FROM payout_intents pi
  JOIN tontine_beneficiary_slots slot
    ON slot.organization_id=pi.organization_id AND slot.id=pi.tontine_slot_id
  JOIN tontine_memberships membership
    ON membership.organization_id=slot.organization_id
   AND membership.group_id=slot.group_id
   AND membership.id=slot.beneficiary_membership_id
  WHERE pi.organization_id=$1 AND pi.payout_id=$2
`;

export class PostgresTontinePayoutRepository {
  constructor(private readonly db: TontineSqlExecutor) {}

  async createIfAbsent(plan: TontinePayoutPlan): Promise<{ payout: PersistedTontinePayout; replayed: boolean }> {
    const intent = plan.intent;
    if (!intent.organizationId || intent.organizationId !== String(intent.organizationId)) throw new Error("TONTINE_PAYOUT_ORGANIZATION_INVALID");
    if (intent.amountMinor <= 0n || !intent.destinationRef.trim() || !intent.idempotencyKey.trim()) throw new Error("TONTINE_PAYOUT_INTENT_INVALID");
    if (plan.gate === "blocked") throw new Error("TONTINE_PAYOUT_BLOCKED");
    return this.db.transaction(async tx => {
      const inserted = await tx.query<PayoutRow>(
        `INSERT INTO payout_intents
          (payout_id,organization_id,cycle_id,beneficiary_id,amount_minor,currency,destination_ref,state,
           idempotency_key,requires_human_approval,kyc_verified,created_at,tontine_slot_id)
         SELECT $1,$2,c.id::text,$3,$4::numeric,$5,$6,$7,$8,$9,$10,$11::timestamptz,slot.id
         FROM tontine_beneficiary_slots slot
         JOIN tontine_cycles c ON c.organization_id=slot.organization_id AND c.id=slot.cycle_id
         JOIN tontine_memberships m ON m.organization_id=slot.organization_id
           AND m.group_id=slot.group_id AND m.id=slot.beneficiary_membership_id
         WHERE slot.organization_id=$2 AND slot.id=$12 AND c.id::text=$13
           AND slot.status='eligible' AND slot.amount_target_minor=$4::numeric
           AND m.client_id::text=$3 AND m.status='active'
         ON CONFLICT (organization_id,idempotency_key) DO NOTHING
         RETURNING payout_id,organization_id,cycle_id,beneficiary_id,amount_minor::text AS amount_minor,
           currency,destination_ref,state,idempotency_key,requires_human_approval,kyc_verified,created_at,
           provider,provider_reference,settlement_transaction_id,tontine_slot_id`,
        [intent.payoutId,intent.organizationId,intent.beneficiaryId,intent.amountMinor.toString(),intent.currency,
          intent.destinationRef,intent.state,intent.idempotencyKey,intent.requiresHumanApproval,intent.kycVerified,
          intent.createdAt,plan.beneficiaryMembershipId,intent.cycleId]
      );
      if (inserted.rows[0]) {
        const row = inserted.rows[0];
        return { payout: {
          intent: { ...intent },
          beneficiaryMembershipId: plan.beneficiaryMembershipId,
          microfinanceId: plan.microfinanceId,
          tontineSlotId: String(row.tontine_slot_id ?? plan.beneficiaryMembershipId) as UUID
        }, replayed: false };
      }
      const existing = await tx.query<PayoutRow>(
        SELECT_PAYOUT + " AND pi.idempotency_key=$3 FOR UPDATE",
        [intent.organizationId,intent.payoutId,intent.idempotencyKey]
      );
      if (existing.rows[0]) {
        const payout = toPayout(existing.rows[0]);
        if (payout.intent.beneficiaryId !== intent.beneficiaryId ||
            payout.intent.cycleId !== intent.cycleId ||
            payout.intent.amountMinor !== intent.amountMinor ||
            payout.intent.currency !== intent.currency ||
            payout.intent.destinationRef !== intent.destinationRef) {
          throw new Error("TONTINE_PAYOUT_IDEMPOTENCY_CONFLICT");
        }
        return { payout, replayed: true };
      }
      const byKey = await tx.query<PayoutRow>(
        SELECT_PAYOUT.replace("WHERE pi.organization_id=$1 AND pi.payout_id=$2","WHERE pi.organization_id=$1 AND pi.idempotency_key=$2 FOR UPDATE"),
        [intent.organizationId,intent.idempotencyKey]
      );
      if (!byKey.rows[0]) throw new Error("TONTINE_PAYOUT_SLOT_NOT_ELIGIBLE_OR_IDEMPOTENCY_CONFLICT");
      const payout = toPayout(byKey.rows[0]);
      if (payout.intent.beneficiaryId !== intent.beneficiaryId ||
          payout.intent.cycleId !== intent.cycleId ||
          payout.intent.amountMinor !== intent.amountMinor ||
          payout.intent.currency !== intent.currency ||
          payout.intent.destinationRef !== intent.destinationRef) throw new Error("TONTINE_PAYOUT_IDEMPOTENCY_CONFLICT");
      return { payout, replayed: true };
    });
  }

  async approve(organizationId: UUID, payoutId: UUID, approval: PayoutApproval): Promise<PersistedTontinePayout> {
    return this.db.transaction(async tx => {
      const selected = await tx.query<PayoutRow>(SELECT_PAYOUT + " FOR UPDATE", [organizationId,payoutId]);
      const row = selected.rows[0];
      if (!row) throw new Error("TONTINE_PAYOUT_NOT_FOUND");
      if (String(row.state) !== "pending_approval" || !Boolean(row.requires_human_approval) || !Boolean(row.kyc_verified)) {
        throw new Error("TONTINE_PAYOUT_NOT_APPROVABLE");
      }
      if (approval.payoutId !== payoutId || approval.decision !== "approve" || !approval.approverId.trim()) {
        throw new Error("TONTINE_PAYOUT_APPROVAL_INVALID");
      }
      if (approval.approverId === String(row.beneficiary_id)) throw new Error("PAYOUT_SELF_APPROVAL_FORBIDDEN");
      const saved = await tx.query(
        `INSERT INTO payout_approvals(payout_id,approver_id,decision,reason,approved_at)
         VALUES($1,$2,'approve',$3,$4::timestamptz)
         ON CONFLICT (payout_id,approver_id) DO NOTHING RETURNING payout_id`,
        [payoutId,approval.approverId,approval.reason ?? null,approval.at]
      );
      if ((saved.rowCount ?? saved.rows.length) !== 1) throw new Error("TONTINE_PAYOUT_APPROVAL_DUPLICATE");
      const updated = await tx.query(
        "UPDATE payout_intents SET state='approved' WHERE organization_id=$1 AND payout_id=$2 AND state='pending_approval' RETURNING payout_id",
        [organizationId,payoutId]
      );
      if ((updated.rowCount ?? updated.rows.length) !== 1) throw new Error("TONTINE_PAYOUT_APPROVAL_CONFLICT");
      const refreshed = await tx.query<PayoutRow>(SELECT_PAYOUT, [organizationId,payoutId]);
      if (!refreshed.rows[0]) throw new Error("TONTINE_PAYOUT_NOT_FOUND");
      return toPayout(refreshed.rows[0]);
    });
  }

  async markInitiated(organizationId: UUID, payoutId: UUID, provider: string, providerReference: string): Promise<void> {
    if (!provider.trim() || !providerReference.trim()) throw new Error("TONTINE_PAYOUT_PROVIDER_EVIDENCE_REQUIRED");
    const result = await this.db.query(
      "UPDATE payout_intents SET state='initiated',provider=$3,provider_reference=$4 WHERE organization_id=$1 AND payout_id=$2 AND state='approved'",
      [organizationId,payoutId,provider,providerReference]
    );
    if ((result.rowCount ?? 0) !== 1) throw new Error("TONTINE_PAYOUT_INITIATION_CONFLICT");
  }

  async markSettled(organizationId: UUID, payoutId: UUID, ledgerTransactionId: UUID, providerEventId: string): Promise<void> {
    if (!providerEventId.trim()) throw new Error("TONTINE_PAYOUT_PROVIDER_EVENT_REQUIRED");
    await this.db.transaction(async tx => {
      const result = await tx.query(
        `UPDATE payout_intents
         SET state='confirmed',settlement_transaction_id=$3,provider_event_id=$4
         WHERE organization_id=$1 AND payout_id=$2 AND state='initiated' AND provider_reference IS NOT NULL`,
        [organizationId,payoutId,ledgerTransactionId,providerEventId]
      );
      if ((result.rowCount ?? 0) !== 1) throw new Error("TONTINE_PAYOUT_SETTLEMENT_CONFLICT");
      const slot = await tx.query(
        "UPDATE tontine_beneficiary_slots SET status='paid',paid_at=now() WHERE organization_id=$1 AND id=(SELECT tontine_slot_id FROM payout_intents WHERE organization_id=$1 AND payout_id=$2) AND status='eligible'",
        [organizationId,payoutId]
      );
      if ((slot.rowCount ?? 0) !== 1) throw new Error("TONTINE_PAYOUT_SLOT_SETTLEMENT_CONFLICT");
    });
  }
}
