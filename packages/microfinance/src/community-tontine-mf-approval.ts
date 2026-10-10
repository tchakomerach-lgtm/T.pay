import type { UUID } from "../../domain/src/types.js";
import type { CommunityTontineMfAccess, CommunityTontineMfSettlementInstruction } from "./community-tontine-management.js";
import { assertMfScope, assertMfCapability, assertSettlementMayProceed } from "./community-tontine-management.js";
import type { CommunityTontineMfAccessRepository } from "./community-tontine-mf-repositories.js";

export interface CommunityTontineMfApprovalRepository {
  markApproved(
    organizationId: UUID,
    instructionId: UUID,
    approverId: UUID,
    expectedState: CommunityTontineMfSettlementInstruction["state"]
  ): Promise<CommunityTontineMfSettlementInstruction>;
}

export class CommunityTontineMfApprovalService {
  constructor(
    private readonly accessRepository: CommunityTontineMfAccessRepository,
    private readonly approvals: CommunityTontineMfApprovalRepository
  ) {}

  async approve(
    access: CommunityTontineMfAccess,
    organizationId: UUID,
    instruction: CommunityTontineMfSettlementInstruction,
    approverId: UUID,
    now: string
  ): Promise<CommunityTontineMfSettlementInstruction> {
    if (!approverId?.trim()) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_APPROVER_REQUIRED");
    const persistedAccess = await this.accessRepository.getActive(
      organizationId, instruction.tontineGroupId, instruction.microfinanceId, access.role
    );
    if (!persistedAccess || persistedAccess.id !== access.id) throw new Error("COMMUNITY_TONTINE_MF_ACCESS_NOT_ACTIVE");
    assertMfScope(persistedAccess, organizationId, instruction.tontineGroupId, instruction.microfinanceId, now);
    assertMfCapability(persistedAccess, "payout.approve");
    if (instruction.state !== "prepared") throw new Error("COMMUNITY_TONTINE_PAYOUT_NOT_PREPARED");
    if (instruction.preparedBy && instruction.preparedBy === approverId) throw new Error("COMMUNITY_TONTINE_MAKER_CHECKER_REQUIRED");

    const approved = await this.approvals.markApproved(organizationId, instruction.id, approverId, "prepared");
    // Validate the durable row returned by the compare-and-set, not caller-supplied amounts or destination.
    assertSettlementMayProceed(approved);
    return approved;
  }
}
