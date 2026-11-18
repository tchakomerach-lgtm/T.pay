-- CT-042: cycle continuity protection, premium schedules and insurer-reviewed abandonment claims.
-- The platform never underwrites risk or writes directly to the ledger. All premium/claim cash movements
-- must be executed and confirmed by Financial Core against an executed licensed-insurer contract.

CREATE TABLE IF NOT EXISTS community_tontine_protection_policies (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL,
  version text NOT NULL CHECK (length(btrim(version)) BETWEEN 1 AND 80),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  state text NOT NULL CHECK (state IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
  proposal_origin text NOT NULL CHECK (proposal_origin IN ('TPAY','MICROFINANCE')),
  risk_bearer text NOT NULL CHECK (risk_bearer='LICENSED_INSURER'),
  insurer_partner_id uuid NOT NULL,
  insurer_license_reference text NOT NULL CHECK (length(btrim(insurer_license_reference)) > 0),
  insurer_contract_reference text NOT NULL CHECK (length(btrim(insurer_contract_reference)) > 0),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  tiers jsonb NOT NULL CHECK (jsonb_typeof(tiers)='array' AND jsonb_array_length(tiers)=3),
  policy_hash char(64) NOT NULL CHECK (policy_hash ~ '^[a-fA-F0-9]{64}$'),
  created_by uuid NOT NULL,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  UNIQUE (organization_id,group_id,version),
  UNIQUE (organization_id,group_id,id),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK (approved_by IS NULL OR approved_by <> created_by),
  CHECK (state <> 'ACTIVE' OR (approved_by IS NOT NULL AND activated_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_community_tontine_active_protection_policy
  ON community_tontine_protection_policies(organization_id,group_id) WHERE state='ACTIVE';

CREATE TABLE IF NOT EXISTS community_tontine_protection_enrollments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  policy_id uuid NOT NULL,
  tier text NOT NULL CHECK (tier IN ('ESSENTIEL','EQUILIBRE','RENFORCE')),
  state text NOT NULL CHECK (state IN ('PENDING','ACTIVE','SUSPENDED','CANCELLED')),
  accepted_at timestamptz NOT NULL,
  coverage_starts_at timestamptz NOT NULL,
  consent_reference text NOT NULL CHECK (length(btrim(consent_reference)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,group_id,policy_id)
    REFERENCES community_tontine_protection_policies(organization_id,group_id,id) ON DELETE RESTRICT,
  UNIQUE (organization_id,group_id,member_id,policy_id),
  UNIQUE (organization_id,group_id,id),
  CHECK (coverage_starts_at >= accepted_at)
);
CREATE INDEX IF NOT EXISTS idx_community_tontine_protection_enrollment_member
  ON community_tontine_protection_enrollments(organization_id,group_id,member_id,state);

CREATE TABLE IF NOT EXISTS community_tontine_protection_premiums (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  installment_reference uuid NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  installment_minor numeric(38,0) NOT NULL CHECK (installment_minor > 0),
  premium_minor numeric(38,0) NOT NULL CHECK (premium_minor > 0),
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 1 AND 1000),
  state text NOT NULL CHECK (state IN ('DUE','PAYMENT_PENDING','SETTLED','FAILED','WAIVED','REVERSED')),
  financial_core_reference uuid,
  due_at timestamptz NOT NULL,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,group_id,enrollment_id)
    REFERENCES community_tontine_protection_enrollments(organization_id,group_id,id) ON DELETE RESTRICT,
  UNIQUE (organization_id,group_id,enrollment_id,installment_reference),
  UNIQUE (organization_id,group_id,id),
  UNIQUE (financial_core_reference),
  CHECK ((state='SETTLED' AND financial_core_reference IS NOT NULL AND settled_at IS NOT NULL) OR state<>'SETTLED')
);
CREATE INDEX IF NOT EXISTS idx_community_tontine_protection_premium_due
  ON community_tontine_protection_premiums(organization_id,group_id,state,due_at);

CREATE TABLE IF NOT EXISTS community_tontine_protection_claims (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  installment_reference uuid NOT NULL,
  premium_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('SUBMITTED','UNDER_REVIEW','APPROVED_BY_INSURER','REJECTED','PAID','CLOSED')),
  claimed_minor numeric(38,0) NOT NULL CHECK (claimed_minor > 0),
  approved_minor numeric(38,0) CHECK (approved_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object'),
  insurer_claim_reference text,
  financial_core_reference uuid,
  submitted_by uuid NOT NULL,
  reviewed_by uuid,
  submitted_at timestamptz NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,group_id,enrollment_id)
    REFERENCES community_tontine_protection_enrollments(organization_id,group_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,group_id,premium_id)
    REFERENCES community_tontine_protection_premiums(organization_id,group_id,id) ON DELETE RESTRICT,
  UNIQUE (organization_id,group_id,enrollment_id,installment_reference),
  UNIQUE (organization_id,group_id,id),
  CHECK (reviewed_by IS NULL OR reviewed_by <> submitted_by),
  CHECK (state <> 'PAID' OR (approved_minor IS NOT NULL AND financial_core_reference IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_community_tontine_protection_claims_review
  ON community_tontine_protection_claims(organization_id,group_id,state,submitted_at);

CREATE TABLE IF NOT EXISTS community_tontine_protection_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL,
  enrollment_id uuid,
  claim_id uuid,
  actor_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'POLICY_PROPOSED','POLICY_APPROVED','POLICY_ACTIVATED','ENROLLED','CONSENT_RECORDED',
    'PREMIUM_QUOTED','PREMIUM_SETTLED','CLAIM_SUBMITTED','CLAIM_REVIEWED',
    'INSURER_APPROVED','CLAIM_REJECTED','CLAIM_PAID','ENROLLMENT_SUSPENDED','ENROLLMENT_CANCELLED'
  )),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,group_id,enrollment_id)
    REFERENCES community_tontine_protection_enrollments(organization_id,group_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,group_id,claim_id)
    REFERENCES community_tontine_protection_claims(organization_id,group_id,id) ON DELETE RESTRICT,
  CHECK (enrollment_id IS NOT NULL OR claim_id IS NOT NULL OR event_type LIKE 'POLICY_%')
);
CREATE INDEX IF NOT EXISTS idx_community_tontine_protection_events_scope
  ON community_tontine_protection_events(organization_id,group_id,occurred_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'community_tontine_protection_policies',
    'community_tontine_protection_enrollments',
    'community_tontine_protection_premiums',
    'community_tontine_protection_claims',
    'community_tontine_protection_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I',t || '_organization_scope',t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (organization_id=public.tpay_current_organization_id()) WITH CHECK (organization_id=public.tpay_current_organization_id())',
      t || '_organization_scope',t
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION community_tontine_protection_reject_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COMMUNITY_TONTINE_PROTECTION_EVENT_IMMUTABLE';
END;
$$;
DROP TRIGGER IF EXISTS community_tontine_protection_events_immutable ON community_tontine_protection_events;
CREATE TRIGGER community_tontine_protection_events_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON community_tontine_protection_events
FOR EACH STATEMENT EXECUTE FUNCTION community_tontine_protection_reject_event_mutation();

COMMENT ON TABLE community_tontine_protection_policies IS
  'Versioned cycle-protection products; activation requires a verified licensed insurer and executed contract.';
COMMENT ON TABLE community_tontine_protection_premiums IS
  'Premium schedule only. SETTLED requires a Financial Core reference; this table never posts ledger entries.';
COMMENT ON TABLE community_tontine_protection_claims IS
  'Abandonment claims routed to the licensed insurer. Approval is not a payment; PAID requires Financial Core reference.';
