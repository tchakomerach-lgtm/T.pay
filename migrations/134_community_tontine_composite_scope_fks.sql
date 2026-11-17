-- DB-074 / CT-038: enforce organization + group consistency at the database boundary.
-- Existing single-column IDs remain stable; composite keys prevent cross-organization references.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_groups_org_id
  ON tontine_groups(organization_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_community_tontine_commission_policies_org_id
  ON community_tontine_commission_policies(organization_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_community_tontine_commission_policies_scope_id
  ON community_tontine_commission_policies(organization_id, group_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_community_tontine_promotion_campaigns_scope_id
  ON community_tontine_promotion_campaigns(organization_id, group_id, id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='community_tontine_commission_policies_group_scope_fk' AND conrelid='community_tontine_commission_policies'::regclass) THEN
    ALTER TABLE community_tontine_commission_policies
      ADD CONSTRAINT community_tontine_commission_policies_group_scope_fk
      FOREIGN KEY (organization_id, group_id)
      REFERENCES tontine_groups(organization_id, id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='community_tontine_role_grants_group_scope_fk' AND conrelid='community_tontine_role_grants'::regclass) THEN
    ALTER TABLE community_tontine_role_grants
      ADD CONSTRAINT community_tontine_role_grants_group_scope_fk
      FOREIGN KEY (organization_id, group_id)
      REFERENCES tontine_groups(organization_id, id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='community_tontine_promotion_campaigns_group_scope_fk' AND conrelid='community_tontine_promotion_campaigns'::regclass) THEN
    ALTER TABLE community_tontine_promotion_campaigns
      ADD CONSTRAINT community_tontine_promotion_campaigns_group_scope_fk
      FOREIGN KEY (organization_id, group_id)
      REFERENCES tontine_groups(organization_id, id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='community_tontine_promotion_redemptions_campaign_scope_fk' AND conrelid='community_tontine_promotion_redemptions'::regclass) THEN
    ALTER TABLE community_tontine_promotion_redemptions
      ADD CONSTRAINT community_tontine_promotion_redemptions_campaign_scope_fk
      FOREIGN KEY (organization_id, group_id, campaign_id)
      REFERENCES community_tontine_promotion_campaigns(organization_id, group_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='community_tontine_commission_policy_audit_scope_fk' AND conrelid='community_tontine_commission_policy_audit'::regclass) THEN
    ALTER TABLE community_tontine_commission_policy_audit
      ADD CONSTRAINT community_tontine_commission_policy_audit_scope_fk
      FOREIGN KEY (organization_id, group_id, policy_id)
      REFERENCES community_tontine_commission_policies(organization_id, group_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_fee_snapshots_policy_scope_fk' AND conrelid='tontine_fee_snapshots'::regclass) THEN
    ALTER TABLE tontine_fee_snapshots
      ADD CONSTRAINT tontine_fee_snapshots_policy_scope_fk
      FOREIGN KEY (organization_id, policy_id)
      REFERENCES community_tontine_commission_policies(organization_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END;
$$;

ALTER TABLE community_tontine_commission_policies VALIDATE CONSTRAINT community_tontine_commission_policies_group_scope_fk;
ALTER TABLE community_tontine_role_grants VALIDATE CONSTRAINT community_tontine_role_grants_group_scope_fk;
ALTER TABLE community_tontine_promotion_campaigns VALIDATE CONSTRAINT community_tontine_promotion_campaigns_group_scope_fk;
ALTER TABLE community_tontine_promotion_redemptions VALIDATE CONSTRAINT community_tontine_promotion_redemptions_campaign_scope_fk;
ALTER TABLE community_tontine_commission_policy_audit VALIDATE CONSTRAINT community_tontine_commission_policy_audit_scope_fk;
ALTER TABLE tontine_fee_snapshots VALIDATE CONSTRAINT tontine_fee_snapshots_policy_scope_fk;
