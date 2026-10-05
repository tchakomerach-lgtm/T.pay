import type { UUID } from "../../domain/src/types.js";
import type {
  CommunityTontineGroup,
  CommunityTontineMembership,
  TontineBeneficiarySlot
} from "./community-tontine.js";

export interface SqlResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount?: number;
}

export interface TontineSqlExecutor {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<SqlResult<Row>>;
  transaction<T>(work: (tx: TontineSqlExecutor) => Promise<T>): Promise<T>;
}

export interface TontineGroupRepository {
  getById(organizationId: UUID, groupId: UUID): Promise<CommunityTontineGroup | null>;
  save(group: CommunityTontineGroup): Promise<void>;
}

export interface TontineMembershipRepository {
  listActive(organizationId: UUID, groupId: UUID): Promise<CommunityTontineMembership[]>;
  getForUpdate(organizationId: UUID, membershipId: UUID): Promise<CommunityTontineMembership | null>;
  save(membership: CommunityTontineMembership): Promise<void>;
}

export interface TontineBeneficiarySlotRepository {
  createIfAbsent(organizationId: UUID, slot: TontineBeneficiarySlot): Promise<TontineBeneficiarySlot>;
  claimScheduledSlot(
    organizationId: UUID,
    groupId: UUID,
    cycleNumber: number,
    expectedBeneficiaryMemberId: UUID
  ): Promise<TontineBeneficiarySlot>;
  markPaid(organizationId: UUID, slotId: UUID, paidAt: string): Promise<void>;
}

const asBigInt = (value: unknown): bigint => BigInt(String(value));

function groupFromRow(row: Record<string, unknown>): CommunityTontineGroup {
  return {
    id: row.id as UUID,
    organizationId: row.organization_id as UUID,
    name: String(row.name),
    countryCode: String(row.country_code),
    currency: String(row.currency),
    frequency: row.frequency as CommunityTontineGroup["frequency"],
    contributionMode: row.contribution_mode as CommunityTontineGroup["contributionMode"],
    targetMinor: row.target_minor == null ? undefined : asBigInt(row.target_minor),
    fixedAmountMinor: row.fixed_amount_minor == null ? undefined : asBigInt(row.fixed_amount_minor),
    minimumAmountMinor: asBigInt(row.minimum_amount_minor),
    cycleNumber: Number(row.cycle_number),
    maxMembers: row.max_members == null ? undefined : Number(row.max_members),
    governance: row.governance as CommunityTontineGroup["governance"],
    partnerMicrofinanceId: row.partner_microfinance_id as UUID | undefined,
    status: row.status as CommunityTontineGroup["status"],
    createdBy: row.created_by as UUID,
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function membershipFromRow(row: Record<string, unknown>): CommunityTontineMembership {
  return {
    id: row.id as UUID,
    groupId: row.group_id as UUID,
    clientId: row.client_id as UUID,
    role: row.role as CommunityTontineMembership["role"],
    status: row.status as CommunityTontineMembership["status"],
    joinedAt: new Date(String(row.joined_at)).toISOString(),
    exitedAt: row.exited_at == null ? undefined : new Date(String(row.exited_at)).toISOString(),
    selectedMicrofinanceId: row.selected_microfinance_id as UUID | undefined
  };
}

function slotFromRow(row: Record<string, unknown>): TontineBeneficiarySlot {
  return {
    id: row.id as UUID,
    groupId: row.group_id as UUID,
    cycleNumber: Number(row.cycle_number),
    sequence: Number(row.sequence),
    beneficiaryMemberId: row.beneficiary_membership_id as UUID,
    amountTargetMinor: asBigInt(row.amount_target_minor),
    status: row.status as TontineBeneficiarySlot["status"],
    scheduledFor: new Date(String(row.scheduled_for)).toISOString(),
    paidAt: row.paid_at == null ? undefined : new Date(String(row.paid_at)).toISOString()
  };
}

export class PostgresTontineGroupRepository implements TontineGroupRepository {
  constructor(private readonly db: TontineSqlExecutor) {}

  async getById(organizationId: UUID, groupId: UUID): Promise<CommunityTontineGroup | null> {
    const result = await this.db.query(
      "SELECT * FROM tontine_groups WHERE organization_id = $1 AND id = $2",
      [organizationId, groupId]
    );
    return result.rows[0] ? groupFromRow(result.rows[0]) : null;
  }

  async save(group: CommunityTontineGroup): Promise<void> {
    await this.db.query(
      `INSERT INTO tontine_groups
        (id, organization_id, name, country_code, currency, frequency, contribution_mode,
         target_minor, fixed_amount_minor, minimum_amount_minor, cycle_number, max_members,
         governance, partner_microfinance_id, status, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, status=EXCLUDED.status, cycle_number=EXCLUDED.cycle_number,
         max_members=EXCLUDED.max_members, governance=EXCLUDED.governance`,
      [
        group.id, group.organizationId, group.name, group.countryCode, group.currency,
        group.frequency, group.contributionMode, group.targetMinor?.toString() ?? null,
        group.fixedAmountMinor?.toString() ?? null, group.minimumAmountMinor.toString(),
        group.cycleNumber, group.maxMembers ?? null, group.governance,
        group.partnerMicrofinanceId ?? null, group.status, group.createdBy, group.createdAt
      ]
    );
  }
}

export class PostgresTontineMembershipRepository implements TontineMembershipRepository {
  constructor(private readonly db: TontineSqlExecutor) {}

  async listActive(organizationId: UUID, groupId: UUID): Promise<CommunityTontineMembership[]> {
    const result = await this.db.query(
      "SELECT * FROM tontine_memberships WHERE organization_id=$1 AND group_id=$2 AND status='active' ORDER BY joined_at,id",
      [organizationId, groupId]
    );
    return result.rows.map(membershipFromRow);
  }

  async getForUpdate(organizationId: UUID, membershipId: UUID): Promise<CommunityTontineMembership | null> {
    const result = await this.db.query(
      "SELECT * FROM tontine_memberships WHERE organization_id=$1 AND id=$2 FOR UPDATE",
      [organizationId, membershipId]
    );
    return result.rows[0] ? membershipFromRow(result.rows[0]) : null;
  }

  async save(membership: CommunityTontineMembership): Promise<void> {
    await this.db.query(
      `INSERT INTO tontine_memberships
       (id,organization_id,group_id,client_id,role,status,joined_at,exited_at,selected_microfinance_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, exited_at=EXCLUDED.exited_at,
         selected_microfinance_id=EXCLUDED.selected_microfinance_id`,
      [
        membership.id, membership.organizationId ?? null, membership.groupId, membership.clientId,
        membership.role, membership.status, membership.joinedAt, membership.exitedAt ?? null,
        membership.selectedMicrofinanceId ?? null
      ]
    );
  }
}

export class PostgresTontineBeneficiarySlotRepository implements TontineBeneficiarySlotRepository {
  constructor(private readonly db: TontineSqlExecutor) {}

  async createIfAbsent(organizationId: UUID, slot: TontineBeneficiarySlot): Promise<TontineBeneficiarySlot> {
    const result = await this.db.query(
      `INSERT INTO tontine_beneficiary_slots
       (id,organization_id,group_id,cycle_number,sequence,beneficiary_membership_id,
        amount_target_minor,status,scheduled_for)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (group_id,cycle_number)
       DO UPDATE SET beneficiary_membership_id=tontine_beneficiary_slots.beneficiary_membership_id
       RETURNING *`,
      [
        slot.id, organizationId, slot.groupId, slot.cycleNumber, slot.sequence,
        slot.beneficiaryMemberId, slot.amountTargetMinor.toString(), slot.status, slot.scheduledFor
      ]
    );
    const row = result.rows[0];
    if (!row) throw new Error("TONTINE_BENEFICIARY_SLOT_CREATE_FAILED");
    return slotFromRow(row);
  }

  async claimScheduledSlot(
    organizationId: UUID,
    groupId: UUID,
    cycleNumber: number,
    expectedBeneficiaryMemberId: UUID
  ): Promise<TontineBeneficiarySlot> {
    const result = await this.db.query(
      `UPDATE tontine_beneficiary_slots
       SET status='eligible'
       WHERE organization_id=$1 AND group_id=$2 AND cycle_number=$3
         AND beneficiary_membership_id=$4 AND status='scheduled'
       RETURNING *`,
      [organizationId, groupId, cycleNumber, expectedBeneficiaryMemberId]
    );
    const row = result.rows[0];
    if (!row) throw new Error("TONTINE_BENEFICIARY_SLOT_CLAIM_CONFLICT");
    return slotFromRow(row);
  }

  async markPaid(organizationId: UUID, slotId: UUID, paidAt: string): Promise<void> {
    const result = await this.db.query(
      `UPDATE tontine_beneficiary_slots
       SET status='paid', paid_at=$3
       WHERE organization_id=$1 AND id=$2 AND status='eligible'`,
      [organizationId, slotId, paidAt]
    );
    if ((result.rowCount ?? 0) !== 1) throw new Error("TONTINE_BENEFICIARY_SLOT_NOT_PAYABLE");
  }
}

export async function withTontineTransaction<T>(
  db: TontineSqlExecutor,
  work: (tx: TontineSqlExecutor) => Promise<T>
): Promise<T> {
  return db.transaction(work);
}
