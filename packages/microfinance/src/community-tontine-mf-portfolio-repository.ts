import type { UUID } from "../../domain/src/types.js";
import type { CommunityTontineMfPortfolio } from "./community-tontine-management.js";
import type { TontineSqlExecutor } from "./tontine-repositories.js";

export interface CommunityTontineMfPortfolioRepository {
  get(organizationId: UUID, tontineGroupId: UUID, microfinanceId: UUID): Promise<CommunityTontineMfPortfolio | null>;
}

export class PostgresCommunityTontineMfPortfolioRepository implements CommunityTontineMfPortfolioRepository {
  constructor(private readonly db: TontineSqlExecutor) {}

  async get(organizationId: UUID, tontineGroupId: UUID, microfinanceId: UUID): Promise<CommunityTontineMfPortfolio | null> {
    const result = await this.db.query(`
      WITH scoped_group AS (
        SELECT g.id, g.organization_id, g.currency
        FROM tontine_groups g
        WHERE g.organization_id = $1 AND g.id = $2
      ),
      scoped_members AS (
        SELECT m.id, m.organization_id, m.group_id, m.client_id, m.status
        FROM tontine_memberships m
        JOIN scoped_group g ON g.id = m.group_id AND g.organization_id = m.organization_id
        WHERE m.selected_microfinance_id = $3
      ),
      contribution_by_member AS (
        SELECT
          s.membership_id,
          SUM(CASE WHEN s.due_status = 'due' THEN s.expected_amount_minor ELSE 0 END) AS due_minor,
          SUM(CASE WHEN s.due_status = 'confirmed' THEN s.expected_amount_minor ELSE 0 END) AS confirmed_minor,
          SUM(CASE WHEN s.due_status = 'pending' THEN s.expected_amount_minor ELSE 0 END) AS pending_minor,
          COUNT(*) FILTER (WHERE s.due_status = 'missed')::int AS missed_count
        FROM tontine_member_schedules s
        JOIN scoped_members m ON m.id = s.membership_id AND m.organization_id = s.organization_id
        GROUP BY s.membership_id
      ),
      contribution_summary AS (
        SELECT
          COALESCE(SUM(due_minor), 0) AS due_minor,
          COALESCE(SUM(confirmed_minor), 0) AS confirmed_minor,
          COALESCE(SUM(pending_minor), 0) AS pending_minor,
          COALESCE(SUM(missed_count), 0)::int AS missed_count
        FROM contribution_by_member
      ),
      payout_summary AS (
        SELECT
          COALESCE(SUM(CASE WHEN s.status IN ('scheduled', 'eligible') THEN s.amount_target_minor ELSE 0 END), 0) AS scheduled_payout_minor,
          COALESCE(SUM(CASE WHEN s.status = 'eligible' THEN s.amount_target_minor ELSE 0 END), 0) AS eligible_payout_minor,
          COUNT(*) FILTER (WHERE s.status = 'blocked')::int AS exception_count
        FROM tontine_beneficiary_slots s
        JOIN scoped_group g ON g.id = s.group_id AND g.organization_id = s.organization_id
        JOIN tontine_memberships bm ON bm.id = s.beneficiary_membership_id AND bm.organization_id = s.organization_id AND bm.group_id = s.group_id
        WHERE bm.selected_microfinance_id = $3
      )
      SELECT
        g.id AS tontine_group_id,
        $3::uuid AS microfinance_id,
        g.currency,
        (SELECT COUNT(*)::int FROM scoped_members WHERE status = 'active') AS active_members,
        cs.due_minor,
        cs.confirmed_minor,
        cs.pending_minor,
        cs.missed_count,
        ps.scheduled_payout_minor,
        ps.eligible_payout_minor,
        ps.exception_count
      FROM scoped_group g
      CROSS JOIN contribution_summary cs
      CROSS JOIN payout_summary ps
    `, [organizationId, tontineGroupId, microfinanceId]);

    const row = result.rows[0];
    if (!row) return null;
    return {
      tontineGroupId: row.tontine_group_id as UUID,
      microfinanceId: row.microfinance_id as UUID,
      currency: String(row.currency),
      activeMembers: Number(row.active_members),
      dueContributionMinor: BigInt(String(row.due_minor)),
      confirmedContributionMinor: BigInt(String(row.confirmed_minor)),
      pendingContributionMinor: BigInt(String(row.pending_minor)),
      missedContributionCount: Number(row.missed_count),
      scheduledPayoutMinor: BigInt(String(row.scheduled_payout_minor)),
      eligiblePayoutMinor: BigInt(String(row.eligible_payout_minor)),
      unsettledExceptionCount: Number(row.exception_count)
    };
  }
}
