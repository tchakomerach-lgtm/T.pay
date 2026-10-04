CREATE TABLE IF NOT EXISTS mfi_repayment_schedules (
 schedule_id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), credit_request_id uuid NOT NULL,
 installment_no integer NOT NULL CHECK (installment_no>0), due_at timestamptz NOT NULL,
 principal_due_minor numeric(38,0) NOT NULL CHECK (principal_due_minor>=0),
 interest_due_minor numeric(38,0) NOT NULL CHECK (interest_due_minor>=0),
 fee_due_minor numeric(38,0) NOT NULL CHECK (fee_due_minor>=0),
 principal_paid_minor numeric(38,0) NOT NULL DEFAULT 0 CHECK (principal_paid_minor>=0),
 interest_paid_minor numeric(38,0) NOT NULL DEFAULT 0 CHECK (interest_paid_minor>=0),
 fee_paid_minor numeric(38,0) NOT NULL DEFAULT 0 CHECK (fee_paid_minor>=0),
 grace_until timestamptz, state text NOT NULL CHECK(state IN ('scheduled','due','partial','paid','delinquent','restructured','written_off')),
 policy_version text NOT NULL, UNIQUE(organization_id,schedule_id), UNIQUE(organization_id,credit_request_id,installment_no)
);
CREATE TABLE IF NOT EXISTS mfi_repayment_intents (
 repayment_id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), credit_request_id uuid NOT NULL,
 schedule_id uuid, payer_id text NOT NULL, amount_minor numeric(38,0) NOT NULL CHECK(amount_minor>0), currency char(3) NOT NULL,
 source text NOT NULL CHECK(source IN ('cash_agent','tmoney','flooz','pi_spi','tontine','partner_mfi')),
 idempotency_key text NOT NULL, provider_reference text, status text NOT NULL CHECK(status IN ('pending','accepted','rejected','quarantined','settled')),
 occurred_at timestamptz NOT NULL, UNIQUE(organization_id,repayment_id), UNIQUE(organization_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS mfi_repayment_allocations (
 allocation_id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), repayment_id uuid NOT NULL,
 schedule_id uuid NOT NULL, principal_minor numeric(38,0) NOT NULL CHECK(principal_minor>=0),
 interest_minor numeric(38,0) NOT NULL CHECK(interest_minor>=0), fee_minor numeric(38,0) NOT NULL CHECK(fee_minor>=0),
 allocation_version text NOT NULL, created_at timestamptz NOT NULL,
 UNIQUE(organization_id,repayment_id,schedule_id)
);
CREATE TABLE IF NOT EXISTS mfi_recovery_actions (
 action_id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), credit_request_id uuid NOT NULL,
 action_type text NOT NULL CHECK(action_type IN ('reminder','agent_visit','restructure_review','legal_review','write_off_review')),
 status text NOT NULL CHECK(status IN ('queued','assigned','completed','cancelled')), reason_code text NOT NULL,
 scheduled_at timestamptz NOT NULL, completed_at timestamptz, UNIQUE(organization_id,action_id)
);
CREATE INDEX IF NOT EXISTS idx_mfi_repayment_due ON mfi_repayment_schedules(organization_id,state,due_at);
CREATE INDEX IF NOT EXISTS idx_mfi_repayment_status ON mfi_repayment_intents(organization_id,status,occurred_at);
