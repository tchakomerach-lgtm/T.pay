-- 139: Dual protection products and deterministic cycle closeout.
-- Stores coverage, settlement snapshots and refund instructions only. No Ledger writes.
CREATE TABLE IF NOT EXISTS community_tontine_protection_products (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 group_id uuid NOT NULL, product_code text NOT NULL CHECK(product_code IN ('GENERAL_CYCLE','INDIVIDUAL_CONTRIBUTION')),
 version text NOT NULL CHECK(length(btrim(version)) BETWEEN 1 AND 80),
 risk_bearer text NOT NULL CHECK(risk_bearer IN ('LICENSED_INSURER','AUTHORIZED_MUTUAL_SCHEME')),
 partner_id uuid NOT NULL, partner_authorization_reference text NOT NULL CHECK(length(btrim(partner_authorization_reference))>0),
 contract_reference text NOT NULL CHECK(length(btrim(contract_reference))>0),
 authorization_verified boolean NOT NULL DEFAULT false, contract_verified boolean NOT NULL DEFAULT false,
 currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 pricing jsonb NOT NULL CHECK(jsonb_typeof(pricing)='object'),
 terms_hash char(64) NOT NULL CHECK(terms_hash ~ '^[a-fA-F0-9]{64}$'),
 state text NOT NULL CHECK(state IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
 created_by uuid NOT NULL, approved_by uuid, effective_from timestamptz NOT NULL,
 effective_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,group_id,product_code,version), UNIQUE(organization_id,group_id,id),
 FOREIGN KEY(organization_id,group_id) REFERENCES tontine_groups(organization_id,id) ON DELETE RESTRICT,
 CHECK(approved_by IS NULL OR approved_by<>created_by),
 CHECK(effective_until IS NULL OR effective_until>effective_from),
 CHECK(state<>'ACTIVE' OR (approved_by IS NOT NULL AND authorization_verified AND contract_verified))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_protection_active_product
 ON community_tontine_protection_products(organization_id,group_id,product_code) WHERE state='ACTIVE';

CREATE TABLE IF NOT EXISTS community_tontine_individual_coverages (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 group_id uuid NOT NULL, member_id uuid NOT NULL, product_id uuid NOT NULL,
 coverage_limit_minor numeric(38,0) NOT NULL CHECK(coverage_limit_minor>0),
 premium_rate_bps integer NOT NULL CHECK(premium_rate_bps BETWEEN 1 AND 1000),
 state text NOT NULL CHECK(state IN ('PENDING_CONSENT','ACTIVE','SUSPENDED','CANCELLED','EXPIRED')),
 consent_reference text NOT NULL CHECK(length(btrim(consent_reference))>0),
 consented_at timestamptz NOT NULL, coverage_starts_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,group_id) REFERENCES tontine_groups(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,group_id,member_id) REFERENCES tontine_memberships(organization_id,group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,group_id,product_id) REFERENCES community_tontine_protection_products(organization_id,group_id,id) ON DELETE RESTRICT,
 UNIQUE(organization_id,group_id,id), CHECK(coverage_starts_at>=consented_at)
);
CREATE INDEX IF NOT EXISTS idx_tontine_individual_coverage_member
 ON community_tontine_individual_coverages(organization_id,group_id,member_id,state);

CREATE TABLE IF NOT EXISTS community_tontine_individual_coverage_installments (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 group_id uuid NOT NULL, coverage_id uuid NOT NULL, installment_reference uuid NOT NULL,
 contribution_minor numeric(38,0) NOT NULL CHECK(contribution_minor>0),
 premium_minor numeric(38,0) NOT NULL CHECK(premium_minor>0),
 coverage_limit_minor numeric(38,0) NOT NULL CHECK(coverage_limit_minor>0),
 premium_payment_intent_reference uuid UNIQUE, premium_financial_core_reference uuid UNIQUE,
 state text NOT NULL CHECK(state IN ('QUOTED','PAYMENT_PENDING','COVERED','CLAIMED','PAID','EXPIRED','REVERSED')),
 due_at timestamptz NOT NULL, settled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,group_id,coverage_id)
 REFERENCES community_tontine_individual_coverages(organization_id,group_id,id) ON DELETE RESTRICT,
 UNIQUE(organization_id,group_id,coverage_id,installment_reference), UNIQUE(organization_id,group_id,id),
 CHECK(state<>'COVERED' OR (premium_financial_core_reference IS NOT NULL AND settled_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_tontine_individual_installment_due
 ON community_tontine_individual_coverage_installments(organization_id,group_id,state,due_at);

CREATE TABLE IF NOT EXISTS community_tontine_cycle_closeouts (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 group_id uuid NOT NULL, cycle_id uuid NOT NULL, currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 state text NOT NULL CHECK(state IN ('CALCULATING','INCIDENT_REVIEW','READY_FOR_SETTLEMENT','SETTLEMENT_PENDING','SETTLED','BLOCKED','REVERSED')),
 incident_count integer NOT NULL CHECK(incident_count>=0),
 gross_refundable_minor numeric(38,0) NOT NULL CHECK(gross_refundable_minor>=0),
 tpay_commission_minor numeric(38,0) NOT NULL CHECK(tpay_commission_minor>=0),
 microfinance_commission_minor numeric(38,0) NOT NULL CHECK(microfinance_commission_minor>=0),
 earned_insurance_premium_minor numeric(38,0) NOT NULL CHECK(earned_insurance_premium_minor>=0),
 approved_claims_minor numeric(38,0) NOT NULL CHECK(approved_claims_minor>=0),
 other_contractual_deductions_minor numeric(38,0) NOT NULL DEFAULT 0 CHECK(other_contractual_deductions_minor>=0),
 net_refund_minor numeric(38,0) NOT NULL CHECK(net_refund_minor>=0),
 calculation_hash char(64) NOT NULL CHECK(calculation_hash ~ '^[a-fA-F0-9]{64}$'),
 incident_review_reference text, financial_core_batch_reference uuid UNIQUE,
 idempotency_key text NOT NULL CHECK(length(btrim(idempotency_key)) BETWEEN 8 AND 160),
 calculated_at timestamptz NOT NULL, settled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,group_id) REFERENCES tontine_groups(organization_id,id) ON DELETE RESTRICT,
 UNIQUE(organization_id,group_id,cycle_id), UNIQUE(organization_id,id), UNIQUE(organization_id,idempotency_key),
 CHECK(net_refund_minor=GREATEST(0,gross_refundable_minor-tpay_commission_minor-microfinance_commission_minor-earned_insurance_premium_minor-approved_claims_minor-other_contractual_deductions_minor)),
 CHECK(state NOT IN ('READY_FOR_SETTLEMENT','SETTLEMENT_PENDING','SETTLED') OR (incident_count=0 AND incident_review_reference IS NOT NULL)),
 CHECK(state<>'SETTLED' OR (financial_core_batch_reference IS NOT NULL AND settled_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_tontine_cycle_closeout_state
 ON community_tontine_cycle_closeouts(organization_id,group_id,state,calculated_at);

CREATE TABLE IF NOT EXISTS community_tontine_cycle_refund_allocations (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, group_id uuid NOT NULL, closeout_id uuid NOT NULL, member_id uuid NOT NULL,
 gross_share_minor numeric(38,0) NOT NULL CHECK(gross_share_minor>=0),
 tpay_commission_minor numeric(38,0) NOT NULL CHECK(tpay_commission_minor>=0),
 microfinance_commission_minor numeric(38,0) NOT NULL CHECK(microfinance_commission_minor>=0),
 other_deductions_minor numeric(38,0) NOT NULL CHECK(other_deductions_minor>=0),
 net_refund_minor numeric(38,0) NOT NULL CHECK(net_refund_minor>=0),
 financial_core_reference uuid UNIQUE,
 state text NOT NULL CHECK(state IN ('CALCULATED','PENDING','PAID','FAILED','REVERSED')),
 paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,group_id,closeout_id) REFERENCES community_tontine_cycle_closeouts(organization_id,group_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,group_id,member_id) REFERENCES tontine_memberships(organization_id,group_id,id) ON DELETE RESTRICT,
 UNIQUE(organization_id,group_id,closeout_id,member_id),
 CHECK(net_refund_minor=GREATEST(0,gross_share_minor-tpay_commission_minor-microfinance_commission_minor-other_deductions_minor)),
 CHECK(state<>'PAID' OR (financial_core_reference IS NOT NULL AND paid_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_tontine_refund_allocations_pending
 ON community_tontine_cycle_refund_allocations(organization_id,group_id,state,created_at);

CREATE TABLE IF NOT EXISTS community_tontine_protection_financial_events (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 group_id uuid NOT NULL, closeout_id uuid, allocation_id uuid,
 event_type text NOT NULL CHECK(event_type IN ('INDIVIDUAL_COVERAGE_CONSENTED','INDIVIDUAL_PREMIUM_QUOTED','INDIVIDUAL_PREMIUM_SETTLED','CYCLE_CLOSEOUT_CALCULATED','CYCLE_CLOSEOUT_BLOCKED','CYCLE_CLOSEOUT_APPROVED','REFUND_BATCH_REQUESTED','REFUND_PAID','REFUND_FAILED','CYCLE_CLOSEOUT_REVERSED')),
 actor_id uuid NOT NULL, payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,group_id) REFERENCES tontine_groups(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,closeout_id) REFERENCES community_tontine_cycle_closeouts(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(allocation_id) REFERENCES community_tontine_cycle_refund_allocations(id) ON DELETE RESTRICT,
 CHECK(closeout_id IS NOT NULL OR allocation_id IS NOT NULL)
);

DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['community_tontine_protection_products','community_tontine_individual_coverages','community_tontine_individual_coverage_installments','community_tontine_cycle_closeouts','community_tontine_cycle_refund_allocations','community_tontine_protection_financial_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I',t||'_organization_scope',t);
  EXECUTE format('CREATE POLICY %I ON %I USING (organization_id=public.tpay_current_organization_id()) WITH CHECK (organization_id=public.tpay_current_organization_id())',t||'_organization_scope',t);
 END LOOP;
END;
$$;
CREATE OR REPLACE FUNCTION community_tontine_protection_financial_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'COMMUNITY_TONTINE_PROTECTION_FINANCIAL_EVENT_IMMUTABLE'; END;
$$;
DROP TRIGGER IF EXISTS community_tontine_protection_financial_events_immutable ON community_tontine_protection_financial_events;
CREATE TRIGGER community_tontine_protection_financial_events_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON community_tontine_protection_financial_events
FOR EACH STATEMENT EXECUTE FUNCTION community_tontine_protection_financial_event_immutable();

COMMENT ON TABLE community_tontine_protection_products IS 'Versioned GENERAL_CYCLE and INDIVIDUAL_CONTRIBUTION products; no activation without verified legal partner and contract.';
COMMENT ON TABLE community_tontine_individual_coverage_installments IS 'Optional per-member/per-installment cover; COVERED requires Financial Core settlement reference.';
COMMENT ON TABLE community_tontine_cycle_closeouts IS 'Cycle closeout snapshot only; Financial Core validates inputs and executes the actual refund batch.';
COMMENT ON TABLE community_tontine_cycle_refund_allocations IS 'Per-member refund instructions; PAID requires a Financial Core settlement reference.';
