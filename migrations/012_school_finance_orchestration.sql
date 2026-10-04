CREATE TABLE IF NOT EXISTS school_finance_requests (
  request_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  school_id text NOT NULL,
  parent_id text NOT NULL,
  student_id text NOT NULL,
  partner_mfi_id text NOT NULL,
  annual_tuition_minor numeric(38,0) NOT NULL CHECK (annual_tuition_minor >= 0),
  supply_minor numeric(38,0) NOT NULL CHECK (supply_minor >= 0),
  currency text NOT NULL,
  recovery_frequency text NOT NULL CHECK (recovery_frequency IN ('daily','weekly','monthly')),
  recovery_minimum_minor numeric(38,0) NOT NULL CHECK (recovery_minimum_minor > 0),
  status text NOT NULL CHECK (status IN ('requested','eligibility_review','approved','funded','recovering','repaid','rejected','exception')),
  policy_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,request_id)
);
CREATE TABLE IF NOT EXISTS school_finance_expenses (
  expense_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  request_id uuid NOT NULL,
  expense_type text NOT NULL CHECK (expense_type IN ('tuition','supplies')),
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
  beneficiary_ref text NOT NULL,
  evidence_hash text NOT NULL,
  paid_at timestamptz,
  status text NOT NULL CHECK (status IN ('planned','approved','paid','cancelled')),
  FOREIGN KEY (organization_id,request_id) REFERENCES school_finance_requests(organization_id,request_id),
  UNIQUE (organization_id,expense_id)
);
CREATE TABLE IF NOT EXISTS school_finance_recovery_intents (
  recovery_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  request_id uuid NOT NULL,
  parent_id text NOT NULL,
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL,
  source text NOT NULL CHECK (source IN ('tontine','cash_agent','tmoney','flooz','pi_spi')),
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','accepted','rejected','quarantined')),
  occurred_at timestamptz NOT NULL,
  FOREIGN KEY (organization_id,request_id) REFERENCES school_finance_requests(organization_id,request_id),
  UNIQUE (organization_id,recovery_id),
  UNIQUE (organization_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_school_finance_recovery_request ON school_finance_recovery_intents(organization_id,request_id,status);
