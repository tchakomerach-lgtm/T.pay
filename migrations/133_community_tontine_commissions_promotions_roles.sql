-- CT-014/CT-019/CT-020/CT-008/CT-016: commercial governance for Community Tontine.
-- Additive only: preserves legacy fee snapshots and routes all posted money through Financial Core.

ALTER TABLE tontine_fee_snapshots
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS policy_id uuid,
  ADD COLUMN IF NOT EXISTS transaction_level text,
  ADD COLUMN IF NOT EXISTS payer_mode text,
  ADD COLUMN IF NOT EXISTS member_fee_minor numeric(38,0) NOT NULL DEFAULT 0 CHECK (member_fee_minor >= 0),
  ADD COLUMN IF NOT EXISTS beneficiary_fee_minor numeric(38,0) NOT NULL DEFAULT 0 CHECK (beneficiary_fee_minor >= 0),
  ADD COLUMN IF NOT EXISTS agent_fee_minor numeric(38,0) NOT NULL DEFAULT 0 CHECK (agent_fee_minor >= 0),
  ADD COLUMN IF NOT EXISTS reserve_fee_minor numeric(38,0) NOT NULL DEFAULT 0 CHECK (reserve_fee_minor >= 0),
  ADD COLUMN IF NOT EXISTS tax_fee_minor numeric(38,0) NOT NULL DEFAULT 0 CHECK (tax_fee_minor >= 0),
  ADD COLUMN IF NOT EXISTS optional_service_fee_minor numeric(38,0) NOT NULL DEFAULT 0 CHECK (optional_service_fee_minor >= 0),
  ADD COLUMN IF NOT EXISTS component_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_hash char(64),
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

UPDATE tontine_fee_snapshots f
SET organization_id = c.organization_id
FROM tontine_contributions c
WHERE c.id = f.contribution_id AND f.organization_id IS NULL;

ALTER TABLE tontine_fee_snapshots ALTER COLUMN organization_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_fee_snapshots_org_fk') THEN
    ALTER TABLE tontine_fee_snapshots ADD CONSTRAINT tontine_fee_snapshots_org_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_fee_snapshots_component_total_check') THEN
    ALTER TABLE tontine_fee_snapshots ADD CONSTRAINT tontine_fee_snapshots_component_total_check
      CHECK (total_fee_minor = microfinance_fee_minor + tpay_fee_minor + agent_fee_minor +
        reserve_fee_minor + tax_fee_minor + optional_service_fee_minor);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_fee_snapshots_payer_mode_check') THEN
    ALTER TABLE tontine_fee_snapshots ADD CONSTRAINT tontine_fee_snapshots_payer_mode_check
      CHECK (payer_mode IS NULL OR payer_mode IN ('MEMBER','BENEFICIARY','SPLIT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_fee_snapshots_level_check') THEN
    ALTER TABLE tontine_fee_snapshots ADD CONSTRAINT tontine_fee_snapshots_level_check
      CHECK (transaction_level IS NULL OR transaction_level IN ('CONTRIBUTION','BENEFICIARY_PAYOUT','TRANSFER','OPTIONAL_SERVICE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_fee_snapshots_hash_check') THEN
    ALTER TABLE tontine_fee_snapshots ADD CONSTRAINT tontine_fee_snapshots_hash_check
      CHECK (snapshot_hash IS NULL OR snapshot_hash ~ '^[a-fA-F0-9]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_fee_snapshots_accepted_split_check') THEN
    ALTER TABLE tontine_fee_snapshots ADD CONSTRAINT tontine_fee_snapshots_accepted_split_check
      CHECK (accepted_at IS NULL OR member_fee_minor + beneficiary_fee_minor = total_fee_minor);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS community_tontine_commission_policies (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL,
  version text NOT NULL CHECK (length(btrim(version)) BETWEEN 1 AND 80),
  transaction_level text NOT NULL CHECK (transaction_level IN ('CONTRIBUTION','BENEFICIARY_PAYOUT','TRANSFER','OPTIONAL_SERVICE')),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  state text NOT NULL CHECK (state IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
  payer_mode text NOT NULL CHECK (payer_mode IN ('MEMBER','BENEFICIARY','SPLIT')),
  member_share_bps integer NOT NULL CHECK (member_share_bps BETWEEN 0 AND 10000),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  components jsonb NOT NULL CHECK (jsonb_typeof(components)='array'),
  policy_hash char(64) NOT NULL CHECK (policy_hash ~ '^[a-fA-F0-9]{64}$'),
  created_by uuid NOT NULL,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  UNIQUE (organization_id, group_id, version, transaction_level),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK (approved_by IS NULL OR approved_by <> created_by),
  CHECK ((payer_mode='MEMBER' AND member_share_bps=10000) OR
         (payer_mode='BENEFICIARY' AND member_share_bps=0) OR
         (payer_mode='SPLIT' AND member_share_bps BETWEEN 1 AND 9999)),
  CHECK (state <> 'ACTIVE' OR (approved_by IS NOT NULL AND activated_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_community_tontine_active_commission_policy
  ON community_tontine_commission_policies(organization_id, group_id, transaction_level)
  WHERE state='ACTIVE';

CREATE TABLE IF NOT EXISTS community_tontine_commission_policy_audit (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL,
  policy_id uuid NOT NULL REFERENCES community_tontine_commission_policies(id),
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('CREATED','APPROVED','ACTIVATED','RETIRED')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_tontine_role_grants (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('FOUNDER','COMMUNITY_ADMIN','PRESIDENT','TREASURER','SECRETARY','COLLECTOR','CONTROLLER','MEDIATOR','PAYOUT_APPROVER','MEMBER')),
  permissions text[] NOT NULL DEFAULT '{}',
  granted_by uuid NOT NULL,
  valid_from timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (actor_id <> granted_by),
  CHECK (expires_at > valid_from),
  CHECK (revoked_at IS NULL OR revoked_at >= valid_from)
);
CREATE INDEX IF NOT EXISTS idx_community_tontine_role_grants_scope
  ON community_tontine_role_grants(organization_id, group_id, actor_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS community_tontine_promotion_campaigns (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 3 AND 64),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  state text NOT NULL CHECK (state IN ('DRAFT','APPROVED','ACTIVE','PAUSED','ENDED')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reward_minor numeric(38,0) NOT NULL CHECK (reward_minor >= 0),
  max_redemptions integer NOT NULL CHECK (max_redemptions > 0),
  accepted_redemptions integer NOT NULL DEFAULT 0 CHECK (accepted_redemptions BETWEEN 0 AND max_redemptions),
  max_budget_minor numeric(38,0) NOT NULL CHECK (max_budget_minor >= 0),
  committed_budget_minor numeric(38,0) NOT NULL DEFAULT 0 CHECK (committed_budget_minor BETWEEN 0 AND max_budget_minor),
  allowed_channels text[] NOT NULL,
  created_by uuid NOT NULL,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (approved_by IS NULL OR approved_by <> created_by),
  CHECK (state <> 'ACTIVE' OR approved_by IS NOT NULL),
  CHECK (reward_minor * max_redemptions <= max_budget_minor),
  UNIQUE (organization_id, group_id, code)
);

CREATE TABLE IF NOT EXISTS community_tontine_promotion_redemptions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES community_tontine_promotion_campaigns(id),
  candidate_id uuid NOT NULL,
  ambassador_id uuid,
  channel text NOT NULL CHECK (channel IN ('LINK','QR','USSD','AGENT','SOCIAL')),
  state text NOT NULL CHECK (state IN ('ATTRIBUTED','ELIGIBLE','PENDING_APPROVAL','PAID','REJECTED')),
  reward_minor numeric(38,0) NOT NULL CHECK (reward_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  idempotency_key text NOT NULL,
  first_contribution_id uuid REFERENCES tontine_contributions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (campaign_id, candidate_id),
  CHECK (ambassador_id IS NULL OR ambassador_id <> candidate_id)
);

ALTER TABLE tontine_fee_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tontine_fee_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tontine_fee_snapshots_organization_scope ON tontine_fee_snapshots;
CREATE POLICY tontine_fee_snapshots_organization_scope ON tontine_fee_snapshots
  USING (organization_id=public.tpay_current_organization_id())
  WITH CHECK (organization_id=public.tpay_current_organization_id());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'community_tontine_commission_policies',
    'community_tontine_commission_policy_audit',
    'community_tontine_role_grants',
    'community_tontine_promotion_campaigns',
    'community_tontine_promotion_redemptions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_organization_scope', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (organization_id=public.tpay_current_organization_id()) WITH CHECK (organization_id=public.tpay_current_organization_id())',
      t || '_organization_scope', t
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION community_tontine_reject_immutable_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COMMUNITY_TONTINE_IMMUTABLE_RECORD';
END;
$$;

DROP TRIGGER IF EXISTS community_tontine_commission_policy_audit_immutable ON community_tontine_commission_policy_audit;
CREATE TRIGGER community_tontine_commission_policy_audit_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON community_tontine_commission_policy_audit
FOR EACH STATEMENT EXECUTE FUNCTION community_tontine_reject_immutable_mutation();

DROP TRIGGER IF EXISTS community_tontine_fee_snapshot_immutable ON tontine_fee_snapshots;
CREATE TRIGGER community_tontine_fee_snapshot_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON tontine_fee_snapshots
FOR EACH STATEMENT EXECUTE FUNCTION community_tontine_reject_immutable_mutation();
