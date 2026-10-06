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
      SELECT
        m.tontine_group_id,
        m.microfinance_id,
        COALESCE(g.currency,'XOF') AS currency,
        COUNT(*) FILTER (WHERE m.status='active')::int AS active_members,
        COALESCE(SUM(CASE WHEN c.state='due' THEN c.amount_minor ELSE 0 END),0) AS due_minor,
        COALESCE(SUM(CASE WHEN c.state='confirmed' THEN c.amount_minor ELSE 0 END),0) AS confirmed_minor,
        COALESCE(SUM(CASE WHEN c.state='pending' THEN c.amount_minor ELSE 0 END),0) AS pending_minor,
        COUNT(*) FILTER (WHERE c.state='missed')::int AS missed_count,
        COALESCE(SUM(CASE WHEN s.state IN ('scheduled','eligible') THEN s.net_amount_minor ELSE 0 END),0) AS scheduled_payout_minor,
        COALESCE(SUM(CASE WHEN s.state='eligible' THEN s.net_amount_minor ELSE 0 END),0) AS eligible_payout_minor,
        COUNT(*) FILTER (WHERE s.state='exception')::int AS exception_count
      FROM tontine_memberships m
      JOIN tontine_groups g ON g.id=m.tontine_group_id
      LEFT JOIN tontine_member_schedules c ON c.membership_id=m.id
      LEFT JOIN tontine_beneficiary_slots s ON s.tontine_group_id=m.tontine_group_id
      WHERE m.organization_id=$1 AND m.tontine_group_id=$2 AND m.microfinance_id=$3
      GROUP BY m.tontine_group_id,m.microfinance_id,g.currency
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
