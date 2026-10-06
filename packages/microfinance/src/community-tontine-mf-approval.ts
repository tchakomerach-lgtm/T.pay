import type { UUID } from "../../domain/src/types.js";
import type { CommunityTontineMfAccess, CommunityTontineMfSettlementInstruction } from "./community-tontine-management.js";
import { assertMfScope, assertMfCapability, assertSettlementMayProceed } from "./community-tontine-management.js";

export interface CommunityTontineMfApprovalRepository {
  markApproved(instructionId: UUID, approverId: UUID, expectedState: CommunityTontineMfSettlementInstruction["state"]): Promise<CommunityTontineMfSettlementInstruction>;
}

export class CommunityTontineMfApprovalService {
  constructor(private readonly approvals: CommunityTontineMfApprovalRepository) {}

  async approve(
    access: CommunityTontineMfAccess,
    organizationId: UUID,
    instruction: CommunityTontineMfSettlementInstruction,
    approverId: UUID,
    now: string
  ): Promise<CommunityTontineMfSettlementInstruction> {
    assertMfScope(access, organizationId, instruction.tontineGroupId, instruction.microfinanceId, now);
    assertMfCapability(access, "payout.approve");
    if (instruction.state !== "prepared") throw new Error("COMMUNITY_TONTINE_PAYOUT_NOT_PREPARED");
    if (instruction.preparedBy && instruction.preparedBy === approverId) throw new Error("COMMUNITY_TONTINE_MAKER_CHECKER_REQUIRED");
    const approved = { ...instruction, approvedBy: approverId, state: "approved" as const };
    assertSettlementMayProceed(approved);
    return this.approvals.markApproved(instruction.id, approverId, "prepared");
  }
}
