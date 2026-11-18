-- CT-040: commission proposer authority, immutable negotiated terms and append-only negotiation history.
-- Existing policies are marked LEGACY_UNVERIFIED; new API writes must set an authorized proposal_origin.
ALTER TABLE community_tontine_commission_policies
  ADD COLUMN IF NOT EXISTS proposal_origin text NOT NULL DEFAULT 'LEGACY_UNVERIFIED',
  ADD COLUMN IF NOT EXISTS negotiation_status text NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS negotiation_round integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='community_tontine_commission_policies_proposal_origin_check'
      AND conrelid='community_tontine_commission_policies'::regclass
  ) THEN
    ALTER TABLE community_tontine_commission_policies
      ADD CONSTRAINT community_tontine_commission_policies_proposal_origin_check
      CHECK (proposal_origin IN ('TPAY','MICROFINANCE','COMMUNITY_ADMIN','LEGACY_UNVERIFIED'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='community_tontine_commission_policies_negotiation_status_check'
      AND conrelid='community_tontine_commission_policies'::regclass
  ) THEN
    ALTER TABLE community_tontine_commission_policies
      ADD CONSTRAINT community_tontine_commission_policies_negotiation_status_check
      CHECK (negotiation_status IN ('NOT_STARTED','OPEN','COUNTER_PROPOSED','AGREED','REJECTED','EXPIRED'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='community_tontine_commission_policies_negotiation_round_check'
      AND conrelid='community_tontine_commission_policies'::regclass
  ) THEN
    ALTER TABLE community_tontine_commission_policies
      ADD CONSTRAINT community_tontine_commission_policies_negotiation_round_check
      CHECK (negotiation_round >= 0);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS community_tontine_commission_negotiation_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  policy_id uuid NOT NULL,
  round_no integer NOT NULL CHECK (round_no > 0),
  event_type text NOT NULL CHECK (event_type IN ('PROPOSAL','COUNTEROFFER','ACCEPTED','REJECTED','WITHDRAWN')),
  proposer_type text NOT NULL CHECK (proposer_type IN ('TPAY','MICROFINANCE','COMMUNITY_ADMIN','SYSTEM')),
  actor_id uuid NOT NULL,
  terms jsonb NOT NULL CHECK (jsonb_typeof(terms)='object'),
  terms_hash char(64) NOT NULL CHECK (terms_hash ~ '^[a-fA-F0-9]{64}$'),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,group_id,policy_id)
    REFERENCES community_tontine_commission_policies(organization_id,group_id,id) ON DELETE RESTRICT,
  UNIQUE (organization_id,group_id,policy_id,round_no,event_type,actor_id)
);
CREATE INDEX IF NOT EXISTS idx_community_tontine_commission_negotiations
  ON community_tontine_commission_negotiation_events(organization_id,group_id,policy_id,round_no,occurred_at);

ALTER TABLE community_tontine_commission_negotiation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_tontine_commission_negotiation_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_tontine_commission_negotiation_events_organization_scope
  ON community_tontine_commission_negotiation_events;
CREATE POLICY community_tontine_commission_negotiation_events_organization_scope
  ON community_tontine_commission_negotiation_events
  USING (organization_id=public.tpay_current_organization_id())
  WITH CHECK (organization_id=public.tpay_current_organization_id());

CREATE OR REPLACE FUNCTION community_tontine_commission_policy_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_COMMISSION_POLICY_DELETE_FORBIDDEN';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.transaction_level IS DISTINCT FROM OLD.transaction_level
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.payer_mode IS DISTINCT FROM OLD.payer_mode
     OR NEW.member_share_bps IS DISTINCT FROM OLD.member_share_bps
     OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
     OR NEW.effective_until IS DISTINCT FROM OLD.effective_until
     OR NEW.components IS DISTINCT FROM OLD.components
     OR NEW.policy_hash IS DISTINCT FROM OLD.policy_hash
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.proposal_origin IS DISTINCT FROM OLD.proposal_origin THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_COMMISSION_TERMS_IMMUTABLE';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
    (OLD.state='DRAFT' AND NEW.state='APPROVED')
    OR (OLD.state='APPROVED' AND NEW.state='ACTIVE')
    OR (OLD.state='ACTIVE' AND NEW.state='RETIRED')
  ) THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_COMMISSION_TRANSITION_DENIED';
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     AND NOT (OLD.state='DRAFT' AND NEW.state='APPROVED'
       AND NEW.approved_by IS NOT NULL AND NEW.approved_by<>OLD.created_by) THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_COMMISSION_MAKER_CHECKER_REQUIRED';
  END IF;
  IF NEW.activated_at IS DISTINCT FROM OLD.activated_at
     AND NOT (OLD.state='APPROVED' AND NEW.state='ACTIVE' AND NEW.activated_at IS NOT NULL) THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_COMMISSION_ACTIVATION_TIMESTAMP_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_tontine_commission_policy_guard
  ON community_tontine_commission_policies;
CREATE TRIGGER community_tontine_commission_policy_guard
BEFORE UPDATE OR DELETE ON community_tontine_commission_policies
FOR EACH ROW EXECUTE FUNCTION community_tontine_commission_policy_guard();

CREATE OR REPLACE FUNCTION community_tontine_commission_policy_truncate_guard()
RETURNS trigger LANGUAGE plpgsql AS $
BEGIN
  RAISE EXCEPTION 'COMMUNITY_TONTINE_COMMISSION_POLICY_TRUNCATE_FORBIDDEN';
END;
$;
DROP TRIGGER IF EXISTS community_tontine_commission_policy_no_truncate
  ON community_tontine_commission_policies;
CREATE TRIGGER community_tontine_commission_policy_no_truncate
BEFORE TRUNCATE ON community_tontine_commission_policies
FOR EACH STATEMENT EXECUTE FUNCTION community_tontine_commission_policy_truncate_guard();

CREATE OR REPLACE FUNCTION community_tontine_commission_negotiation_immutable()
RETURNS trigger LANGUAGE plpgsql AS $
BEGIN
  RAISE EXCEPTION 'COMMUNITY_TONTINE_COMMISSION_NEGOTIATION_IMMUTABLE';
END;
$;
DROP TRIGGER IF EXISTS community_tontine_commission_negotiation_immutable
  ON community_tontine_commission_negotiation_events;
CREATE TRIGGER community_tontine_commission_negotiation_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON community_tontine_commission_negotiation_events
FOR EACH STATEMENT EXECUTE FUNCTION community_tontine_commission_negotiation_immutable();

COMMENT ON TABLE community_tontine_commission_negotiation_events IS
  'Append-only, tenant-scoped negotiation history. Each counteroffer is a new immutable event; accepted terms are version-locked and never retroactive.';
COMMENT ON COLUMN community_tontine_commission_policies.proposal_origin IS
  'Server-derived authority: TPAY, MICROFINANCE or COMMUNITY_ADMIN. Legacy rows remain explicitly unverified.';
