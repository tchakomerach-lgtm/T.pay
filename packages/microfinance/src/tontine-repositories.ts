import type { UUID } from "../../domain/src/types.js";
import type {
  CommunityTontineGroup,
  CommunityTontineMembership,
  TontineBeneficiarySlot
} from "./community-tontine.js";
import type { TontineCycle, TontineMemberSchedule } from "./tontine-cycle.js";

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
  save(organizationId: UUID, membership: CommunityTontineMembership): Promise<void>;
}

export interface TontineCycleRepository {
  getById(organizationId: UUID, cycleId: UUID): Promise<TontineCycle | null>;
  save(organizationId: UUID, cycle: TontineCycle): Promise<void>;
}

export interface TontineScheduleRepository {
  listByCycle(organizationId: UUID, cycleId: UUID): Promise<TontineMemberSchedule[]>;
  save(organizationId: UUID, schedule: TontineMemberSchedule): Promise<void>;
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
  const group: CommunityTontineGroup = {
    id: row.id as UUID,
    organizationId: row.organization_id as UUID,
    name: String(row.name),
    countryCode: String(row.country_code),
    currency: String(row.currency),
    frequency: row.frequency as CommunityTontineGroup["frequency"],
    contributionMode: row.contribution_mode as CommunityTontineGroup["contributionMode"],
    minimumAmountMinor: asBigInt(row.minimum_amount_minor),
    cycleNumber: Number(row.cycle_number),
    governance: row.governance as CommunityTontineGroup["governance"],
    status: row.status as CommunityTontineGroup["status"],
    createdBy: row.created_by as UUID,
    createdAt: new Date(String(row.created_at)).toISOString()
  };
  if (row.target_minor != null) group.targetMinor = asBigInt(row.target_minor);
  if (row.fixed_amount_minor != null) group.fixedAmountMinor = asBigInt(row.fixed_amount_minor);
  if (row.max_members != null) group.maxMembers = Number(row.max_members);
  if (row.partner_microfinance_id != null) group.partnerMicrofinanceId = row.partner_microfinance_id as UUID;
  return group;
}

function membershipFromRow(row: Record<string, unknown>): CommunityTontineMembership {
  const membership: CommunityTontineMembership = {
    id: row.id as UUID,
    groupId: row.group_id as UUID,
    clientId: row.client_id as UUID,
    role: row.role as CommunityTontineMembership["role"],
    status: row.status as CommunityTontineMembership["status"],
    joinedAt: new Date(String(row.joined_at)).toISOString()
  };
  if (row.exited_at != null) membership.exitedAt = new Date(String(row.exited_at)).toISOString();
  if (row.selected_microfinance_id != null) membership.selectedMicrofinanceId = row.selected_microfinance_id as UUID;
  return membership;
}

function slotFromRow(row: Record<string, unknown>): TontineBeneficiarySlot {
  const slot: TontineBeneficiarySlot = {
    id: row.id as UUID,
    groupId: row.group_id as UUID,
    cycleNumber: Number(row.cycle_number),
    sequence: Number(row.sequence),
    beneficiaryMemberId: row.beneficiary_membership_id as UUID,
    amountTargetMinor: asBigInt(row.amount_target_minor),
    status: row.status as TontineBeneficiarySlot["status"],
    scheduledFor: new Date(String(row.scheduled_for)).toISOString()
  };
  if (row.paid_at != null) slot.paidAt = new Date(String(row.paid_at)).toISOString();
  return slot;
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

  async save(organizationId: UUID, membership: CommunityTontineMembership): Promise<void> {
    await this.db.query(
      `INSERT INTO tontine_memberships
       (id,organization_id,group_id,client_id,role,status,joined_at,exited_at,selected_microfinance_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, exited_at=EXCLUDED.exited_at,
         selected_microfinance_id=EXCLUDED.selected_microfinance_id`,
      [
        membership.id, organizationId, membership.groupId, membership.clientId,
        membership.role, membership.status, membership.joinedAt, membership.exitedAt ?? null,
        membership.selectedMicrofinanceId ?? null
      ]
    );
  }
}

function cycleFromRow(row: Record<string, unknown>): TontineCycle {
  const cycle: TontineCycle = {
    id: row.id as UUID,
    groupId: row.group_id as UUID,
    cycleNumber: Number(row.cycle_number),
    startsOn: String(row.starts_on),
    endsOn: String(row.ends_on),
    status: row.status as TontineCycle["status"],
    rulesVersion: String(row.rules_version),
    minimumAmountMinor: asBigInt(row.minimum_amount_minor),
    currency: String(row.currency),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
  if (row.closed_at != null) cycle.closedAt = new Date(String(row.closed_at)).toISOString();
  return cycle;
}

function scheduleFromRow(row: Record<string, unknown>): TontineMemberSchedule {
  const schedule: TontineMemberSchedule = {
    id: row.id as UUID,
    cycleId: row.cycle_id as UUID,
    membershipId: row.membership_id as UUID,
    sequence: Number(row.sequence),
    scheduledFor: String(row.scheduled_for),
    expectedAmountMinor: asBigInt(row.expected_amount_minor),
    dueStatus: row.due_status as TontineMemberSchedule["dueStatus"]
  };
  if (row.contribution_id != null) schedule.contributionId = row.contribution_id as UUID;
  if (row.grace_until != null) schedule.graceUntil = new Date(String(row.grace_until)).toISOString();
  if (row.confirmed_at != null) schedule.confirmedAt = new Date(String(row.confirmed_at)).toISOString();
  return schedule;
}

export class PostgresTontineCycleRepository implements TontineCycleRepository {
  constructor(private readonly db: TontineSqlExecutor) {}

  async getById(organizationId: UUID, cycleId: UUID): Promise<TontineCycle | null> {
    const result = await this.db.query(
      "SELECT * FROM tontine_cycles WHERE organization_id=$1 AND id=$2",
      [organizationId, cycleId]
    );
    return result.rows[0] ? cycleFromRow(result.rows[0]) : null;
  }

  async save(organizationId: UUID, cycle: TontineCycle): Promise<void> {
    await this.db.query(
      `INSERT INTO tontine_cycles
       (id,organization_id,group_id,cycle_number,starts_on,ends_on,status,rules_version,minimum_amount_minor,currency,created_at,closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,rules_version=EXCLUDED.rules_version,
         minimum_amount_minor=EXCLUDED.minimum_amount_minor,closed_at=EXCLUDED.closed_at`,
      [
        cycle.id, organizationId, cycle.groupId, cycle.cycleNumber, cycle.startsOn, cycle.endsOn,
        cycle.status, cycle.rulesVersion, cycle.minimumAmountMinor.toString(), cycle.currency,
        cycle.createdAt, cycle.closedAt ?? null
      ]
    );
  }
}

export class PostgresTontineScheduleRepository implements TontineScheduleRepository {
  constructor(private readonly db: TontineSqlExecutor) {}

  async listByCycle(organizationId: UUID, cycleId: UUID): Promise<TontineMemberSchedule[]> {
    const result = await this.db.query(
      "SELECT * FROM tontine_member_schedules WHERE organization_id=$1 AND cycle_id=$2 ORDER BY sequence,id",
      [organizationId, cycleId]
    );
    return result.rows.map(scheduleFromRow);
  }

  async save(organizationId: UUID, schedule: TontineMemberSchedule): Promise<void> {
    await this.db.query(
      `INSERT INTO tontine_member_schedules
       (id,organization_id,cycle_id,membership_id,sequence,scheduled_for,expected_amount_minor,due_status,contribution_id,grace_until,confirmed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET due_status=EXCLUDED.due_status,contribution_id=EXCLUDED.contribution_id,
         grace_until=EXCLUDED.grace_until,confirmed_at=EXCLUDED.confirmed_at`,
      [
        schedule.id, organizationId, schedule.cycleId, schedule.membershipId, schedule.sequence,
        schedule.scheduledFor, schedule.expectedAmountMinor.toString(), schedule.dueStatus,
        schedule.contributionId ?? null, schedule.graceUntil ?? null, schedule.confirmedAt ?? null
      ]
    );
  }
}

export class PostgresTontineBeneficiarySlotRepository implements TontineBeneficiarySlotRepository {
  constructor(private readonly db: TontineSqlExecutor) {}

  async createIfAbsent(organizationId: UUID, slot: TontineBeneficiarySlot): Promise<TontineBeneficiarySlot> {
    const result = await this.db.query(
      `INSERT INTO tontine_beneficiary_slots
       (id,organization_id,group_id,cycle_id,cycle_number,sequence,beneficiary_membership_id,
        amount_target_minor,status,scheduled_for)
       SELECT $1,$2,$3,c.id,$4,$5,$6,$7,$8,$9
       FROM tontine_cycles c
       WHERE c.organization_id=$2 AND c.group_id=$3 AND c.cycle_number=$4
       ON CONFLICT (organization_id,cycle_id,sequence)
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
      `WITH locked_cycle AS (
         SELECT id FROM tontine_cycles
         WHERE organization_id=$1 AND group_id=$2 AND cycle_number=$3
         FOR UPDATE
       )
       UPDATE tontine_beneficiary_slots s
       SET status='eligible'
       WHERE s.organization_id=$1 AND s.cycle_id=(SELECT id FROM locked_cycle)
         AND s.beneficiary_membership_id=$4 AND s.status='scheduled'
       RETURNING s.*`,
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
