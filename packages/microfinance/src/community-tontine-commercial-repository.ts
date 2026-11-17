import type { UUID } from "../../domain/src/types.js";
import type { TontineSqlExecutor } from "./tontine-repositories.js";
import {
  assertCommunityTontineRoleGrant,
  assertPromotionCampaignValid,
  type CommunityTontineCommissionPolicy,
  type CommunityTontinePromotionCampaign,
  type CommunityTontinePromotionRedemption,
  type CommunityTontineAdminRole,
  type CommunityTontinePermission
} from "./community-tontine-commercial-governance.js";

function policyComponentsJson(policy: CommunityTontineCommissionPolicy): string {
  return JSON.stringify(policy.components.map(c => ({
    recipient: c.recipient, rateBps: c.rateBps, enabled: c.enabled,
    ...(c.minMinor !== undefined ? { minMinor: c.minMinor.toString() } : {}),
    ...(c.maxMinor !== undefined ? { maxMinor: c.maxMinor.toString() } : {})
  })));
}

/** PostgreSQL persistence for commercial policy, promotion budget reservations and temporal role grants. */
export class PostgresCommunityTontineCommercialRepository {
  constructor(private readonly db: TontineSqlExecutor) {}

  async createCommissionPolicy(policy: CommunityTontineCommissionPolicy, auditId: UUID, now: string): Promise<void> {
    if (policy.state !== "DRAFT") throw new Error("TONTINE_COMMISSION_POLICY_MUST_START_DRAFT");
    await this.db.transaction(async tx => {
      await tx.query(
        `INSERT INTO community_tontine_commission_policies
         (id,organization_id,group_id,version,transaction_level,currency,state,payer_mode,member_share_bps,
          effective_from,effective_until,components,policy_hash,created_by,approved_by,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',$7,$8,$9::timestamptz,$10::timestamptz,$11::jsonb,$12,$13,NULL,$14::timestamptz)`,
        [policy.id,policy.organizationId,policy.groupId,policy.version,policy.transactionLevel,policy.currency,
         policy.payer,policy.memberShareBps,policy.effectiveFrom,policy.effectiveUntil ?? null,
         policyComponentsJson(policy),policy.policyHash,policy.createdBy,now]
      );
      await tx.query(
        `INSERT INTO community_tontine_commission_policy_audit
         (id,organization_id,group_id,policy_id,actor_id,action,reason,occurred_at)
         VALUES ($1,$2,$3,$4,$5,'CREATED',$6,$7::timestamptz)`,
        [auditId,policy.organizationId,policy.groupId,policy.id,policy.createdBy,"Commission policy created as draft",now]
      );
    });
  }

  async approveCommissionPolicy(input: {
    organizationId: UUID; groupId: UUID; policyId: UUID; approverId: UUID; auditId: UUID; reason: string; now: string;
  }): Promise<void> {
    if (!input.reason.trim()) throw new Error("TONTINE_COMMISSION_APPROVAL_REASON_REQUIRED");
    await this.db.transaction(async tx => {
      const updated = await tx.query(
        `UPDATE community_tontine_commission_policies
         SET state='APPROVED',approved_by=$4
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state='DRAFT' AND created_by<>$4
         RETURNING id`,
        [input.organizationId,input.groupId,input.policyId,input.approverId]
      );
      if (updated.rows.length !== 1) throw new Error("TONTINE_COMMISSION_POLICY_APPROVAL_REJECTED");
      await tx.query(
        `INSERT INTO community_tontine_commission_policy_audit
         (id,organization_id,group_id,policy_id,actor_id,action,reason,occurred_at)
         VALUES ($1,$2,$3,$4,$5,'APPROVED',$6,$7::timestamptz)`,
        [input.auditId,input.organizationId,input.groupId,input.policyId,input.approverId,input.reason.trim(),input.now]
      );
    });
  }

  async activateCommissionPolicy(input: {
    organizationId: UUID; groupId: UUID; policyId: UUID; actorId: UUID; auditId: UUID; reason: string; now: string;
  }): Promise<void> {
    if (!input.reason.trim()) throw new Error("TONTINE_COMMISSION_ACTIVATION_REASON_REQUIRED");
    await this.db.transaction(async tx => {
      const candidate = await tx.query<{created_by:string;approved_by:string|null;effective_from:string;effective_until:string|null}>(
        `SELECT created_by,approved_by,effective_from,effective_until
         FROM community_tontine_commission_policies
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state='APPROVED'
         FOR UPDATE`,
        [input.organizationId,input.groupId,input.policyId]
      );
      const row = candidate.rows[0];
      if (!row || !row.approved_by || row.created_by === row.approved_by || row.approved_by === input.actorId ||
          Date.parse(row.effective_from) > Date.parse(input.now) ||
          (row.effective_until && Date.parse(row.effective_until) <= Date.parse(input.now))) {
        throw new Error("TONTINE_COMMISSION_POLICY_NOT_ACTIVATABLE");
      }
      await tx.query(
        `UPDATE community_tontine_commission_policies SET state='RETIRED'
         WHERE organization_id=$1 AND group_id=$2 AND transaction_level=(
           SELECT transaction_level FROM community_tontine_commission_policies WHERE id=$3
         ) AND state='ACTIVE'`,
        [input.organizationId,input.groupId,input.policyId]
      );
      const activated = await tx.query(
        `UPDATE community_tontine_commission_policies
         SET state='ACTIVE',activated_at=$4::timestamptz
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state='APPROVED'
         RETURNING id`,
        [input.organizationId,input.groupId,input.policyId,input.now]
      );
      if (activated.rows.length !== 1) throw new Error("TONTINE_COMMISSION_POLICY_ACTIVATION_CONFLICT");
      await tx.query(
        `INSERT INTO community_tontine_commission_policy_audit
         (id,organization_id,group_id,policy_id,actor_id,action,reason,occurred_at)
         VALUES ($1,$2,$3,$4,$5,'ACTIVATED',$6,$7::timestamptz)`,
        [input.auditId,input.organizationId,input.groupId,input.policyId,input.actorId,input.reason.trim(),input.now]
      );
    });
  }

  async grantRole(input: {
    id: UUID; organizationId: UUID; groupId: UUID; actorId: UUID;
    grantorId: UUID; grantorRole: CommunityTontineAdminRole; targetRole: CommunityTontineAdminRole;
    permissions: readonly CommunityTontinePermission[]; validFrom: string; expiresAt: string;
  }): Promise<void> {
    assertCommunityTontineRoleGrant({
      grantorRole: input.grantorRole, grantorId: input.grantorId, targetId: input.actorId,
      targetRole: input.targetRole, targetPermissions: input.permissions
    });
    if (Date.parse(input.expiresAt) <= Date.parse(input.validFrom)) throw new Error("TONTINE_ROLE_GRANT_WINDOW_INVALID");
    await this.db.query(
      `INSERT INTO community_tontine_role_grants
       (id,organization_id,group_id,actor_id,role,permissions,granted_by,valid_from,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz)`,
      [input.id,input.organizationId,input.groupId,input.actorId,input.targetRole,[...input.permissions],
       input.grantorId,input.validFrom,input.expiresAt]
    );
  }

  async revokeRole(input: { organizationId: UUID; groupId: UUID; grantId: UUID; revokedAt: string }): Promise<void> {
    const result = await this.db.query(
      `UPDATE community_tontine_role_grants SET revoked_at=$4::timestamptz
       WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND revoked_at IS NULL AND expires_at>$4::timestamptz
       RETURNING id`,
      [input.organizationId,input.groupId,input.grantId,input.revokedAt]
    );
    if (result.rows.length !== 1) throw new Error("TONTINE_ROLE_GRANT_NOT_REVOCABLE");
  }

  async reservePromotionRedemption(input: {
    campaign: CommunityTontinePromotionCampaign; redemption: CommunityTontinePromotionRedemption; now: string;
  }): Promise<void> {
    const { campaign, redemption, now } = input;
    assertPromotionCampaignValid(campaign);
    if (redemption.campaignId !== campaign.id || redemption.groupId !== campaign.groupId ||
        redemption.organizationId !== undefined) {
      // organization scope is supplied by the campaign and checked again in SQL.
      if (redemption.campaignId !== campaign.id || redemption.groupId !== campaign.groupId) {
        throw new Error("TONTINE_PROMOTION_REDEMPTION_SCOPE_MISMATCH");
      }
    }
    await this.db.transaction(async tx => {
      const reserved = await tx.query(
        `UPDATE community_tontine_promotion_campaigns
         SET accepted_redemptions=accepted_redemptions+1,
             committed_budget_minor=committed_budget_minor+$4::numeric
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state='ACTIVE'
           AND starts_at<=$5::timestamptz AND ends_at>$5::timestamptz
           AND allowed_channels @> ARRAY[$6]::text[]
           AND accepted_redemptions<max_redemptions
           AND committed_budget_minor+$4::numeric<=max_budget_minor
         RETURNING id`,
        [campaign.organizationId,campaign.groupId,campaign.id,redemption.rewardMinor.toString(),now,redemption.channel]
      );
      if (reserved.rows.length !== 1) throw new Error("TONTINE_PROMOTION_RESERVATION_REJECTED");
      await tx.query(
        `INSERT INTO community_tontine_promotion_redemptions
         (id,organization_id,group_id,campaign_id,candidate_id,ambassador_id,channel,state,reward_minor,currency,idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ATTRIBUTED',$8::numeric,$9,$10)`,
        [redemption.id,campaign.organizationId,campaign.groupId,campaign.id,redemption.candidateId,
         redemption.ambassadorId ?? null,redemption.channel,redemption.rewardMinor.toString(),
         redemption.currency,redemption.idempotencyKey]
      );
    });
  }

  async markPromotionRewardPendingApproval(input: {
    organizationId: UUID; groupId: UUID; redemptionId: UUID; firstContributionId: UUID; now: string;
    candidateVerified: boolean; membershipAccepted: boolean; fraudReviewClear: boolean;
  }): Promise<void> {
    if (!input.candidateVerified || !input.membershipAccepted || !input.fraudReviewClear) {
      throw new Error("TONTINE_PROMOTION_REWARD_EVIDENCE_INCOMPLETE");
    }
    await this.db.transaction(async tx => {
      const settled = await tx.query(
        `SELECT c.id FROM tontine_contributions c
         WHERE c.organization_id=$1 AND c.group_id=$2 AND c.id=$3 AND c.status='confirmed'
         FOR UPDATE`,
        [input.organizationId,input.groupId,input.firstContributionId]
      );
      if (settled.rows.length !== 1) throw new Error("TONTINE_PROMOTION_FIRST_CONTRIBUTION_NOT_SETTLED");
      const updated = await tx.query(
        `UPDATE community_tontine_promotion_redemptions
         SET state='PENDING_APPROVAL',first_contribution_id=$4
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state='ATTRIBUTED'
         RETURNING id`,
        [input.organizationId,input.groupId,input.redemptionId,input.firstContributionId]
      );
      if (updated.rows.length !== 1) throw new Error("TONTINE_PROMOTION_REDEMPTION_STATE_CONFLICT");
    });
  }
}
