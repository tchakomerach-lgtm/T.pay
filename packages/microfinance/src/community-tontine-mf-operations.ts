import type { UUID } from "../../domain/src/types.js";
import {
  assertMfCapability,
  assertMfScope,
  type CommunityTontineMfAccess,
  type CommunityTontineMfCapability,
  type CommunityTontineMfMemberView,
  type CommunityTontineMfPortfolio,
  type CommunityTontineMfReconciliationItem,
  type CommunityTontineMfSettlementInstruction
} from "./community-tontine-management.js";
import type { CommunityTontineMfAccessRepository, CommunityTontineMfReconciliationRepository } from "./community-tontine-mf-repositories.js";
import type { CommunityTontineMfSettlementRepository } from "./community-tontine-mf-settlement-repository.js";

export interface CommunityTontineMfPortfolioReader {
  getPortfolio(organizationId: UUID, groupId: UUID, microfinanceId: UUID): Promise<CommunityTontineMfPortfolio>;
  listMembers(organizationId: UUID, groupId: UUID, microfinanceId: UUID): Promise<CommunityTontineMfMemberView[]>;
}

export interface CommunityTontineMfOperations {
  prepareSettlement(access: CommunityTontineMfAccess, organizationId: UUID, instruction: CommunityTontineMfSettlementInstruction, preparerId: UUID): Promise<CommunityTontineMfSettlementInstruction>;
  listReconciliation(access: CommunityTontineMfAccess, organizationId: UUID, microfinanceId: UUID): Promise<CommunityTontineMfReconciliationItem[]>;
}

function authorize(access: CommunityTontineMfAccess, capability: CommunityTontineMfCapability, organizationId: UUID, groupId: UUID, microfinanceId: UUID): void {
  assertMfScope(access, organizationId, groupId, microfinanceId, new Date().toISOString());
  assertMfCapability(access, capability);
}

export class CommunityTontineMfOperationsService implements CommunityTontineMfOperations {
  constructor(
    private readonly accessRepository: CommunityTontineMfAccessRepository,
    private readonly reconciliationRepository: CommunityTontineMfReconciliationRepository,
    private readonly settlementRepository: CommunityTontineMfSettlementRepository
  ) {}

  private async resolveAccess(supplied: CommunityTontineMfAccess, organizationId: UUID, groupId: UUID, microfinanceId: UUID): Promise<CommunityTontineMfAccess> {
    const persisted = await this.accessRepository.getActive(organizationId, groupId, microfinanceId, supplied.role);
    if (!persisted || persisted.id !== supplied.id) throw new Error("COMMUNITY_TONTINE_MF_ACCESS_NOT_ACTIVE");
    return persisted;
  }

  async listReconciliation(access: CommunityTontineMfAccess, organizationId: UUID, microfinanceId: UUID): Promise<CommunityTontineMfReconciliationItem[]> {
    const persisted = await this.resolveAccess(access, organizationId, access.tontineGroupId, microfinanceId);
    authorize(persisted, "reconciliation.manage", organizationId, persisted.tontineGroupId, microfinanceId);
    return this.reconciliationRepository.listOpen(organizationId, microfinanceId);
  }

  async prepareSettlement(
    access: CommunityTontineMfAccess,
    organizationId: UUID,
    instruction: CommunityTontineMfSettlementInstruction,
    preparerId: UUID
  ): Promise<CommunityTontineMfSettlementInstruction> {
    if (!preparerId?.trim()) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_PREPARER_REQUIRED");
    const persisted = await this.resolveAccess(access, organizationId, instruction.tontineGroupId, instruction.microfinanceId);
    authorize(persisted, "payout.prepare", organizationId, instruction.tontineGroupId, instruction.microfinanceId);
    if (instruction.state !== "prepared") throw new Error("COMMUNITY_TONTINE_SETTLEMENT_ALREADY_PROCESSED");
    if (instruction.amountMinor <= 0n) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_AMOUNT_INVALID");
    if (!instruction.destinationRef.trim()) throw new Error("COMMUNITY_TONTINE_DESTINATION_REQUIRED");
    if (instruction.preparedBy && instruction.preparedBy !== preparerId) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_PREPARER_MISMATCH");
    if (!instruction.requiresHumanApproval) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_HUMAN_APPROVAL_REQUIRED");
    const prepared: CommunityTontineMfSettlementInstruction = {
      ...instruction,
      preparedBy: preparerId,
      approvedBy: undefined,
      state: "prepared"
    };
    return this.settlementRepository.savePrepared(organizationId, prepared);
  }
}
