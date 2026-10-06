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
    const result = await this.db.query(
      `INSERT INTO community_tontine_mf_settlement_instructions
       (id,organization_id,tontine_group_id,microfinance_id,payout_id,beneficiary_client_id,
        amount_minor,currency,destination_ref,requires_human_approval,prepared_by,approved_by,state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,'prepared')
       ON CONFLICT (id) DO UPDATE SET
         amount_minor=EXCLUDED.amount_minor,
         currency=EXCLUDED.currency,
         destination_ref=EXCLUDED.destination_ref,
         requires_human_approval=EXCLUDED.requires_human_approval,
         prepared_by=EXCLUDED.prepared_by,
         state='prepared',
         version=community_tontine_mf_settlement_instructions.version+1,
         last_modified_at=now()
       WHERE community_tontine_mf_settlement_instructions.organization_id=$2
         AND community_tontine_mf_settlement_instructions.state='prepared'
       RETURNING *`,
      [instruction.id,organizationId,instruction.tontineGroupId,instruction.microfinanceId,instruction.payoutId,
       instruction.beneficiaryClientId,instruction.amountMinor.toString(),instruction.currency,instruction.destinationRef,
       instruction.requiresHumanApproval,instruction.preparedBy ?? null]
    );
    if (result.rows.length !== 1) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_PERSISTENCE_CONFLICT");
    return fromRow(result.rows[0]);
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
       RETURNING *`,
      [organizationId,instructionId,approverId,expectedState]
    );
    if (result.rows.length !== 1) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_APPROVAL_CONFLICT");
    return fromRow(result.rows[0]);
  }
}
