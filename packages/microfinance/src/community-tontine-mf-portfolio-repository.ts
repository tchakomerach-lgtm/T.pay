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
      WITH scoped_members AS (
        SELECT m.id, m.tontine_group_id, m.microfinance_id
        FROM tontine_memberships m
        WHERE m.organization_id=$1 AND m.tontine_group_id=$2 AND m.microfinance_id=$3
      ),
      contribution_totals AS (
        SELECT
          c.membership_id,
          SUM(CASE WHEN c.state='due' THEN c.amount_minor ELSE 0 END) AS due_minor,
          SUM(CASE WHEN c.state='confirmed' THEN c.amount_minor ELSE 0 END) AS confirmed_minor,
          SUM(CASE WHEN c.state='pending' THEN c.amount_minor ELSE 0 END) AS pending_minor,
          COUNT(*) FILTER (WHERE c.state='missed')::int AS missed_count
        FROM tontine_member_schedules c
        JOIN scoped_members sm ON sm.id=c.membership_id
        GROUP BY c.membership_id
      ),
      contribution_summary AS (
        SELECT
          COALESCE(SUM(due_minor),0) AS due_minor,
          COALESCE(SUM(confirmed_minor),0) AS confirmed_minor,
          COALESCE(SUM(pending_minor),0) AS pending_minor,
          COALESCE(SUM(missed_count),0)::int AS missed_count
        FROM contribution_totals
      ),
      payout_summary AS (
        SELECT
          COALESCE(SUM(CASE WHEN s.state IN ('scheduled','eligible') THEN s.net_amount_minor ELSE 0 END),0) AS scheduled_payout_minor,
          COALESCE(SUM(CASE WHEN s.state='eligible' THEN s.net_amount_minor ELSE 0 END),0) AS eligible_payout_minor,
          COUNT(*) FILTER (WHERE s.state='exception')::int AS exception_count
        FROM tontine_beneficiary_slots s
        WHERE s.tontine_group_id=$2
      )
      SELECT
        $2 AS tontine_group_id,
        $3 AS microfinance_id,
        COALESCE(g.currency,'XOF') AS currency,
        (SELECT COUNT(*)::int FROM scoped_members WHERE EXISTS (
          SELECT 1 FROM tontine_memberships am WHERE am.id=scoped_members.id AND am.status='active'
        )) AS active_members,
        cs.due_minor,
        cs.confirmed_minor,
        cs.pending_minor,
        cs.missed_count,
        ps.scheduled_payout_minor,
        ps.eligible_payout_minor,
        ps.exception_count
      FROM tontine_groups g
      CROSS JOIN contribution_summary cs
      CROSS JOIN payout_summary ps
      WHERE g.id=$2
    `, [organizationId,tontineGroupId,microfinanceId]);
    const row=result.rows[0]; if (!row) return null;
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
