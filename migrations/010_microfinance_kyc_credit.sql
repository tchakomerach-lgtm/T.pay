CREATE TABLE IF NOT EXISTS mfi_kyc_profiles (
  kyc_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  customer_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','verified','rejected','expired','needs_review')),
  risk_level text NOT NULL CHECK (risk_level IN ('low','medium','high','blocked')),
  policy_version text NOT NULL,
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, kyc_id)
);
CREATE INDEX IF NOT EXISTS idx_mfi_kyc_customer ON mfi_kyc_profiles(organization_id,customer_id);

CREATE TABLE IF NOT EXISTS mfi_kyc_evidence (
  evidence_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  kyc_id uuid NOT NULL,
  evidence_type text NOT NULL CHECK (evidence_type IN ('id_document','selfie_liveness','address','consent','income')),
  provider text,
  external_reference text,
  evidence_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('submitted','verified','rejected','expired')),
  collected_at timestamptz NOT NULL,
  FOREIGN KEY (organization_id, kyc_id) REFERENCES mfi_kyc_profiles(organization_id, kyc_id),
  UNIQUE (organization_id,evidence_id)
);

CREATE TABLE IF NOT EXISTS mfi_credit_applications (
  application_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  customer_id text NOT NULL,
  partner_mfi_id text NOT NULL,
  requested_amount_minor numeric(38,0) NOT NULL CHECK (requested_amount_minor > 0),
  currency text NOT NULL,
  term_days integer NOT NULL CHECK (term_days > 0),
  purpose text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','submitted','kyc_pending','underwriting','approved','rejected','disbursement_pending','active','delinquent','restructured','closed','writeoff')),
  policy_version text NOT NULL,
  submitted_at timestamptz,
  decided_at timestamptz,
  decision_reason text,
  UNIQUE (organization_id,application_id)
);
CREATE INDEX IF NOT EXISTS idx_mfi_credit_customer ON mfi_credit_applications(organization_id,customer_id,status);

CREATE TABLE IF NOT EXISTS mfi_credit_decisions (
  decision_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  application_id uuid NOT NULL,
  policy_version text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approve','reject','manual_review')),
  score_basis jsonb NOT NULL,
  exposure_minor numeric(38,0) NOT NULL CHECK (exposure_minor >= 0),
  repayment_capacity_minor numeric(38,0) NOT NULL CHECK (repayment_capacity_minor >= 0),
  debt_service_ratio_bps integer CHECK (debt_service_ratio_bps >= 0),
  reason_codes jsonb NOT NULL,
  decided_at timestamptz NOT NULL,
  FOREIGN KEY (organization_id,application_id) REFERENCES mfi_credit_applications(organization_id,application_id),
  UNIQUE (organization_id,decision_id)
);
