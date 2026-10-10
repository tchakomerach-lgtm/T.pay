import type { UUID } from "../../domain/src/types.js";
import type { TontineSqlExecutor } from "./tontine-repositories.js";
import type { CommunityTontineMfSettlementInstruction } from "./community-tontine-management.js";

export interface CommunityTontineMfSettlementRepository {
  savePrepared(organizationId: UUID, instruction: CommunityTontineMfSettlementInstruction): Promise<CommunityTontineMfSettlementInstruction>;
  markApproved(
    organizationId: UUID,
    instructionId: UUID,
    approverId: UUID,
    expectedState: CommunityTontineMfSettlementInstruction["state"]
  ): Promise<CommunityTontineMfSettlementInstruction>;
}

function fromRow(row: Record<string, unknown>): CommunityTontineMfSettlementInstruction {
  return {
    id: row.id as UUID,
    tontineGroupId: row.tontine_group_id as UUID,
    microfinanceId: row.microfinance_id as UUID,
    payoutId: row.payout_id as UUID,
    beneficiaryClientId: row.beneficiary_client_id as UUID,
    amountMinor: BigInt(String(row.amount_minor)),
    currency: String(row.currency),
    destinationRef: String(row.destination_ref),
    requiresHumanApproval: Boolean(row.requires_human_approval),
    ...(row.prepared_by != null ? { preparedBy: row.prepared_by as UUID } : {}),
    ...(row.approved_by != null ? { approvedBy: row.approved_by as UUID } : {}),
    state: row.state as CommunityTontineMfSettlementInstruction["state"],
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

export class PostgresCommunityTontineMfSettlementRepository implements CommunityTontineMfSettlementRepository {
  constructor(private readonly db: TontineSqlExecutor) {}

  async savePrepared(organizationId: UUID, instruction: CommunityTontineMfSettlementInstruction): Promise<CommunityTontineMfSettlementInstruction> {
    if (!instruction.preparedBy) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_PREPARER_REQUIRED");
    return this.db.transaction(async tx => {
      const inserted = await tx.query(
        `INSERT INTO community_tontine_mf_settlement_instructions
         (id,organization_id,tontine_group_id,microfinance_id,payout_id,beneficiary_client_id,
          amount_minor,currency,destination_ref,requires_human_approval,prepared_by,approved_by,state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,'prepared')
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [instruction.id,organizationId,instruction.tontineGroupId,instruction.microfinanceId,instruction.payoutId,
         instruction.beneficiaryClientId,instruction.amountMinor.toString(),instruction.currency,instruction.destinationRef,
         instruction.requiresHumanApproval,instruction.preparedBy]
      );
      if (inserted.rows.length === 1) return fromRow(inserted.rows[0]);

      // A replay is accepted only when every immutable field matches the existing prepared instruction.
      const existing = await tx.query(
        `SELECT * FROM community_tontine_mf_settlement_instructions
         WHERE id=$1 AND organization_id=$2 AND tontine_group_id=$3 AND microfinance_id=$4
           AND payout_id=$5 AND beneficiary_client_id=$6 AND amount_minor=$7 AND currency=$8
           AND destination_ref=$9 AND requires_human_approval=$10 AND prepared_by=$11
           AND state='prepared'
         FOR UPDATE`,
        [instruction.id,organizationId,instruction.tontineGroupId,instruction.microfinanceId,instruction.payoutId,
         instruction.beneficiaryClientId,instruction.amountMinor.toString(),instruction.currency,instruction.destinationRef,
         instruction.requiresHumanApproval,instruction.preparedBy]
      );
      if (existing.rows.length !== 1) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_PERSISTENCE_CONFLICT");
      return fromRow(existing.rows[0]);
    });
  }

  async markApproved(
    organizationId: UUID,
    instructionId: UUID,
    approverId: UUID,
    expectedState: CommunityTontineMfSettlementInstruction["state"]
  ): Promise<CommunityTontineMfSettlementInstruction> {
    const result = await this.db.query(
      `UPDATE community_tontine_mf_settlement_instructions
       SET approved_by=$3,state='approved',version=version+1,last_modified_at=now()
       WHERE organization_id=$1 AND id=$2 AND state=$4
         AND (prepared_by IS NULL OR prepared_by <> $3)
         AND requires_human_approval=true
         AND prepared_by IS NOT NULL AND prepared_by <> $3
         AND amount_minor > 0 AND length(btrim(destination_ref)) > 0
       RETURNING *`,
      [organizationId,instructionId,approverId,expectedState]
    );
    if (result.rows.length !== 1) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_APPROVAL_CONFLICT");
    return fromRow(result.rows[0]);
  }
}
