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

export interface CommunityTontineMfPortfolioReader {
  getPortfolio(organizationId: UUID, groupId: UUID, microfinanceId: UUID): Promise<CommunityTontineMfPortfolio>;
  listMembers(organizationId: UUID, groupId: UUID, microfinanceId: UUID): Promise<CommunityTontineMfMemberView[]>;
}

export interface CommunityTontineMfOperations {
  prepareSettlement(access: CommunityTontineMfAccess, organizationId: UUID, instruction: CommunityTontineMfSettlementInstruction): CommunityTontineMfSettlementInstruction;
  listReconciliation(access: CommunityTontineMfAccess, organizationId: UUID, microfinanceId: UUID): Promise<CommunityTontineMfReconciliationItem[]>;
}

function authorize(access: CommunityTontineMfAccess, capability: CommunityTontineMfCapability, organizationId: UUID, groupId: UUID, microfinanceId: UUID): void {
  assertMfScope(access, organizationId, groupId, microfinanceId, new Date().toISOString());
  assertMfCapability(access, capability);
}

export class CommunityTontineMfOperationsService implements CommunityTontineMfOperations {
  constructor(
    private readonly accessRepository: CommunityTontineMfAccessRepository,
    private readonly reconciliationRepository: CommunityTontineMfReconciliationRepository
  ) {}

  async listReconciliation(access: CommunityTontineMfAccess, organizationId: UUID, microfinanceId: UUID): Promise<CommunityTontineMfReconciliationItem[]> {
    authorize(access, "reconciliation.manage", organizationId, access.tontineGroupId, microfinanceId);
    return this.reconciliationRepository.listOpen(organizationId, microfinanceId);
  }

  prepareSettlement(
    access: CommunityTontineMfAccess,
    organizationId: UUID,
    instruction: CommunityTontineMfSettlementInstruction
  ): CommunityTontineMfSettlementInstruction {
    authorize(access, "payout.prepare", organizationId, instruction.tontineGroupId, instruction.microfinanceId);
    if (instruction.state !== "prepared") throw new Error("COMMUNITY_TONTINE_SETTLEMENT_ALREADY_PROCESSED");
    if (instruction.amountMinor <= 0n) throw new Error("COMMUNITY_TONTINE_SETTLEMENT_AMOUNT_INVALID");
    if (!instruction.destinationRef.trim()) throw new Error("COMMUNITY_TONTINE_DESTINATION_REQUIRED");
    return { ...instruction, state: "prepared" };
  }
}
