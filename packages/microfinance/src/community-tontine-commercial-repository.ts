import { randomUUID } from "node:crypto";
import type { UUID } from "../../domain/src/types.js";
import type { TontineSqlExecutor } from "./tontine-repositories.js";
import {
  assertCommunityTontineRoleGrant,
  assertPromotionCampaignValid,
  validateCommunityTontineCommissionPolicy,
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

  async getActiveCommissionPolicy(input: {
    organizationId: UUID; groupId: UUID; transactionLevel: CommunityTontineCommissionPolicy["transactionLevel"];
    currency: string; now: string;
  }): Promise<CommunityTontineCommissionPolicy | null> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id,organization_id,group_id,version,transaction_level,currency,state,payer_mode,member_share_bps,
              effective_from,effective_until,components,policy_hash,created_by,approved_by,proposal_origin
       FROM community_tontine_commission_policies
       WHERE organization_id=$1 AND group_id=$2 AND transaction_level=$3 AND currency=$4
         AND state='ACTIVE' AND effective_from<=$5::timestamptz
         AND (effective_until IS NULL OR effective_until>$5::timestamptz)
       FOR SHARE`,
      [input.organizationId,input.groupId,input.transactionLevel,input.currency,input.now]
    );
    const row = result.rows[0];
    if (!row) return null;
    const rawComponents = typeof row.components === "string" ? JSON.parse(row.components) : row.components;
    if (!Array.isArray(rawComponents)) throw new Error("TONTINE_COMMISSION_POLICY_COMPONENTS_INVALID");
    const components = rawComponents.map((raw: Record<string, unknown>) => ({
      recipient: raw.recipient as CommunityTontineCommissionPolicy["components"][number]["recipient"],
      rateBps: Number(raw.rateBps),
      enabled: raw.enabled === true,
      ...(raw.minMinor !== undefined ? { minMinor: BigInt(String(raw.minMinor)) } : {}),
      ...(raw.maxMinor !== undefined ? { maxMinor: BigInt(String(raw.maxMinor)) } : {})
    }));
    const policy: CommunityTontineCommissionPolicy = {
      id: String(row.id) as UUID, organizationId: String(row.organization_id) as UUID,
      groupId: String(row.group_id) as UUID, version: String(row.version),
      transactionLevel: row.transaction_level as CommunityTontineCommissionPolicy["transactionLevel"],
      currency: String(row.currency), state: row.state as CommunityTontineCommissionPolicy["state"],
      payer: row.payer_mode as CommunityTontineCommissionPolicy["payer"],
      memberShareBps: Number(row.member_share_bps), effectiveFrom: new Date(String(row.effective_from)).toISOString(),
      ...(row.effective_until ? { effectiveUntil: new Date(String(row.effective_until)).toISOString() } : {}),
      components, createdBy: String(row.created_by) as UUID,
      ...(row.approved_by ? { approvedBy: String(row.approved_by) as UUID } : {}),
      proposalOrigin: row.proposal_origin === "TPAY" || row.proposal_origin === "MICROFINANCE" || row.proposal_origin === "COMMUNITY_ADMIN" ? row.proposal_origin : undefined,
      policyHash: String(row.policy_hash)
    };
    return policy;
  }

  async createCommissionPolicy(policy: CommunityTontineCommissionPolicy, auditId: UUID, now: string): Promise<void> {
    validateCommunityTontineCommissionPolicy(policy);
    if (policy.state !== "DRAFT") throw new Error("TONTINE_COMMISSION_POLICY_MUST_START_DRAFT");
    await this.db.transaction(async tx => {
      await tx.query(
        `INSERT INTO community_tontine_commission_policies
         (id,organization_id,group_id,version,transaction_level,currency,state,payer_mode,member_share_bps,
          effective_from,effective_until,components,policy_hash,created_by,approved_by,created_at,proposal_origin)
         VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',$7,$8,$9::timestamptz,$10::timestamptz,$11::jsonb,$12,$13,NULL,$14::timestamptz,$15)`,
        [policy.id,policy.organizationId,policy.groupId,policy.version,policy.transactionLevel,policy.currency,
         policy.payer,policy.memberShareBps,policy.effectiveFrom,policy.effectiveUntil ?? null,
         policyComponentsJson(policy),policy.policyHash,policy.createdBy,now,policy.proposalOrigin ?? "LEGACY_UNVERIFIED"]
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
    const validFrom = Date.parse(input.validFrom), expiresAt = Date.parse(input.expiresAt);
    if (!Number.isFinite(validFrom) || !Number.isFinite(expiresAt) || expiresAt <= validFrom) {
      throw new Error("TONTINE_ROLE_GRANT_WINDOW_INVALID");
    }
    await this.db.transaction(async tx => {
      await tx.query(
        `INSERT INTO community_tontine_role_grants
         (id,organization_id,group_id,actor_id,role,permissions,granted_by,valid_from,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz)`,
        [input.id,input.organizationId,input.groupId,input.actorId,input.targetRole,[...input.permissions],
         input.grantorId,input.validFrom,input.expiresAt]
      );
      await tx.query(
        `INSERT INTO community_tontine_commercial_audit
         (id,organization_id,group_id,object_type,object_id,action,actor_id,reason,payload,occurred_at)
         VALUES ($1,$2,$3,'ROLE_GRANT',$4,'GRANTED',$5,'Temporary role grant created',$6::jsonb,now())`,
        [randomUUID(),input.organizationId,input.groupId,input.id,input.grantorId,
         JSON.stringify({actorId:input.actorId,role:input.targetRole,permissions:[...input.permissions],
           validFrom:input.validFrom,expiresAt:input.expiresAt})]
      );
    });
  }

  async revokeRole(input: { organizationId: UUID; groupId: UUID; grantId: UUID; actorId: UUID; revokedAt: string }): Promise<void> {
    await this.db.transaction(async tx => {
      const result = await tx.query(
        `UPDATE community_tontine_role_grants SET revoked_at=$4::timestamptz
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND revoked_at IS NULL AND expires_at>$4::timestamptz
         RETURNING id`,
        [input.organizationId,input.groupId,input.grantId,input.revokedAt]
      );
      if (result.rows.length !== 1) throw new Error("TONTINE_ROLE_GRANT_NOT_REVOCABLE");
      await tx.query(
        `INSERT INTO community_tontine_commercial_audit
         (id,organization_id,group_id,object_type,object_id,action,actor_id,reason,payload,occurred_at)
         VALUES ($1,$2,$3,'ROLE_GRANT',$4,'REVOKED',$5,'Temporary role grant revoked',$6::jsonb,$7::timestamptz)`,
        [randomUUID(),input.organizationId,input.groupId,input.grantId,input.actorId,
         JSON.stringify({revokedAt:input.revokedAt}),input.revokedAt]
      );
    });
  }

  async getPromotionCampaign(input: {
    organizationId: UUID; groupId: UUID; campaignId: UUID;
  }): Promise<CommunityTontinePromotionCampaign | null> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id,organization_id,group_id,code,title,state,starts_at,ends_at,currency,reward_minor,
              max_redemptions,accepted_redemptions,max_budget_minor,committed_budget_minor,
              allowed_channels,created_by,approved_by
       FROM community_tontine_promotion_campaigns
       WHERE organization_id=$1 AND group_id=$2 AND id=$3
       FOR SHARE`,
      [input.organizationId,input.groupId,input.campaignId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const channels = Array.isArray(row.allowed_channels) ? row.allowed_channels : [];
    return {
      id: String(row.id) as UUID, organizationId: String(row.organization_id) as UUID,
      groupId: String(row.group_id) as UUID, code: String(row.code), title: String(row.title),
      state: row.state as CommunityTontinePromotionCampaign["state"],
      startsAt: new Date(String(row.starts_at)).toISOString(), endsAt: new Date(String(row.ends_at)).toISOString(),
      currency: String(row.currency), rewardMinor: BigInt(String(row.reward_minor)),
      maxRedemptions: Number(row.max_redemptions), acceptedRedemptions: Number(row.accepted_redemptions),
      maxBudgetMinor: BigInt(String(row.max_budget_minor)), committedBudgetMinor: BigInt(String(row.committed_budget_minor)),
      allowedChannels: channels as CommunityTontinePromotionCampaign["allowedChannels"],
      createdBy: String(row.created_by) as UUID,
      ...(row.approved_by ? { approvedBy: String(row.approved_by) as UUID } : {})
    };
  }

  async createPromotionCampaign(campaign: CommunityTontinePromotionCampaign): Promise<void> {
    assertPromotionCampaignValid(campaign);
    if (campaign.state !== "DRAFT") throw new Error("TONTINE_PROMOTION_MUST_START_DRAFT");
    await this.db.transaction(async tx => {
      await tx.query(
        `INSERT INTO community_tontine_promotion_campaigns
         (id,organization_id,group_id,code,title,state,starts_at,ends_at,currency,reward_minor,max_redemptions,
          accepted_redemptions,max_budget_minor,committed_budget_minor,allowed_channels,created_by,approved_by)
         VALUES ($1,$2,$3,$4,$5,'DRAFT',$6::timestamptz,$7::timestamptz,$8,$9::numeric,$10,0,
                 $11::numeric,0,$12,$13,NULL)`,
        [campaign.id,campaign.organizationId,campaign.groupId,campaign.code,campaign.title,campaign.startsAt,
         campaign.endsAt,campaign.currency,campaign.rewardMinor.toString(),campaign.maxRedemptions,
         campaign.maxBudgetMinor.toString(),[...campaign.allowedChannels],campaign.createdBy]
      );
      await tx.query(
        `INSERT INTO community_tontine_commercial_audit
         (id,organization_id,group_id,object_type,object_id,action,actor_id,reason,payload,occurred_at)
         VALUES ($1,$2,$3,'PROMOTION_CAMPAIGN',$4,'CREATED',$5,'Promotion campaign created as draft',$6::jsonb,now())`,
        [randomUUID(),campaign.organizationId,campaign.groupId,campaign.id,campaign.createdBy,
         JSON.stringify({code:campaign.code,currency:campaign.currency,rewardMinor:campaign.rewardMinor.toString(),
           maxRedemptions:campaign.maxRedemptions,maxBudgetMinor:campaign.maxBudgetMinor.toString()})]
      );
    });
  }

  async approvePromotionCampaign(input: {
    organizationId: UUID; groupId: UUID; campaignId: UUID; approverId: UUID;
  }): Promise<void> {
    await this.db.transaction(async tx => {
      const result = await tx.query(
        `UPDATE community_tontine_promotion_campaigns
         SET state='APPROVED',approved_by=$4
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state='DRAFT' AND created_by<>$4
         RETURNING id`,
        [input.organizationId,input.groupId,input.campaignId,input.approverId]
      );
      if (result.rows.length !== 1) throw new Error("TONTINE_PROMOTION_APPROVAL_REJECTED");
      await tx.query(
        `INSERT INTO community_tontine_commercial_audit
         (id,organization_id,group_id,object_type,object_id,action,actor_id,reason,payload,occurred_at)
         VALUES ($1,$2,$3,'PROMOTION_CAMPAIGN',$4,'APPROVED',$5,'Promotion campaign approved by independent approver','{}'::jsonb,now())`,
        [randomUUID(),input.organizationId,input.groupId,input.campaignId,input.approverId]
      );
    });
  }

  async activatePromotionCampaign(input: {
    organizationId: UUID; groupId: UUID; campaignId: UUID; actorId: UUID;
  }): Promise<void> {
    await this.db.transaction(async tx => {
      const result = await tx.query(
        `UPDATE community_tontine_promotion_campaigns
         SET state='ACTIVE'
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state='APPROVED'
           AND approved_by IS NOT NULL AND approved_by<>$4
           AND starts_at<=now() AND ends_at>now()
         RETURNING id`,
        [input.organizationId,input.groupId,input.campaignId,input.actorId]
      );
      if (result.rows.length !== 1) throw new Error("TONTINE_PROMOTION_ACTIVATION_REJECTED");
      await tx.query(
        `INSERT INTO community_tontine_commercial_audit
         (id,organization_id,group_id,object_type,object_id,action,actor_id,reason,payload,occurred_at)
         VALUES ($1,$2,$3,'PROMOTION_CAMPAIGN',$4,'ACTIVATED',$5,'Promotion campaign activated','{}'::jsonb,now())`,
        [randomUUID(),input.organizationId,input.groupId,input.campaignId,input.actorId]
      );
    });
  }

  async reservePromotionRedemption(input: {
    campaign: CommunityTontinePromotionCampaign; redemption: CommunityTontinePromotionRedemption;
    actorId: UUID; now: string;
  }): Promise<void> {
    const { campaign, redemption, now } = input;
    assertPromotionCampaignValid(campaign);
    if (redemption.campaignId !== campaign.id || redemption.groupId !== campaign.groupId ||
        redemption.currency !== campaign.currency || redemption.rewardMinor !== campaign.rewardMinor ||
        redemption.state !== "ATTRIBUTED" || !campaign.allowedChannels.includes(redemption.channel)) {
      throw new Error("TONTINE_PROMOTION_REDEMPTION_SCOPE_MISMATCH");
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
      await tx.query(
        `INSERT INTO community_tontine_commercial_audit
         (id,organization_id,group_id,object_type,object_id,action,actor_id,reason,payload,occurred_at)
         VALUES ($1,$2,$3,'PROMOTION_REDEMPTION',$4,'RESERVED',$5,'Promotion redemption reserved atomically',$6::jsonb,$7::timestamptz)`,
        [randomUUID(),campaign.organizationId,campaign.groupId,redemption.id,input.actorId,
         JSON.stringify({campaignId:campaign.id,candidateId:redemption.candidateId,
           ambassadorId:redemption.ambassadorId??null,rewardMinor:redemption.rewardMinor.toString(),
           idempotencyKey:redemption.idempotencyKey}),now]
      );
    });
  }

  async markPromotionRewardPendingApproval(input: {
    organizationId: UUID; groupId: UUID; redemptionId: UUID; firstContributionId: UUID;
    actorId: UUID; now: string;
    candidateVerified: boolean; membershipAccepted: boolean; fraudReviewClear: boolean;
  }): Promise<void> {
    if (!input.candidateVerified || !input.membershipAccepted || !input.fraudReviewClear) {
      throw new Error("TONTINE_PROMOTION_REWARD_EVIDENCE_INCOMPLETE");
    }
    await this.db.transaction(async tx => {
      const settled = await tx.query(
        `SELECT c.id,r.candidate_id FROM tontine_contributions c
         JOIN tontine_memberships m
           ON m.organization_id=c.organization_id AND m.group_id=c.group_id AND m.id=c.membership_id
         JOIN community_tontine_promotion_redemptions r
           ON r.organization_id=c.organization_id AND r.group_id=c.group_id
          AND r.candidate_id=m.client_id
         WHERE c.organization_id=$1 AND c.group_id=$2 AND c.id=$3
           AND r.id=$4 AND c.status='confirmed' AND m.status='active'
         FOR UPDATE OF c,m`,
        [input.organizationId,input.groupId,input.firstContributionId,input.redemptionId]
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
      await tx.query(
        `INSERT INTO community_tontine_commercial_audit
         (id,organization_id,group_id,object_type,object_id,action,actor_id,reason,payload,occurred_at)
         VALUES ($1,$2,$3,'PROMOTION_REDEMPTION',$4,'PENDING_APPROVAL',$5,'First settled contribution verified; reward awaits approval',$6::jsonb,$7::timestamptz)`,
        [randomUUID(),input.organizationId,input.groupId,input.redemptionId,input.actorId,
         JSON.stringify({firstContributionId:input.firstContributionId,
           candidateId:settled.rows[0]?.candidate_id}),input.now]
      );
    });
  }
}
