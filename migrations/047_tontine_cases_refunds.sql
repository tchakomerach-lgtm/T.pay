CREATE TABLE IF NOT EXISTS tontine_cases (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('incident','dispute','risk_investigation','recovery','refund')),
  state text NOT NULL CHECK (state IN (
    'opened','triaged','evidence_collection','pending_party','microfinance_review',
    'mediation','admin_review','resolution','recovery','confirmed','closed',
    'hold','appealed','escalated','rejected','cancelled'
  )),
  opened_by uuid NOT NULL,
  payout_id uuid,
  contribution_id uuid,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tontine_cases_work_queue
  ON tontine_cases (organization_id, state, severity, updated_at DESC);

CREATE TABLE IF NOT EXISTS tontine_case_evidence (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  case_id uuid NOT NULL REFERENCES tontine_cases(id),
  type text NOT NULL CHECK (type IN ('receipt','provider_callback','statement','photo','document','participant_declaration','system_event')),
  content_hash text NOT NULL,
  object_reference text,
  captured_by uuid NOT NULL,
  captured_at timestamptz NOT NULL,
  UNIQUE (organization_id, case_id, content_hash)
);

CREATE TABLE IF NOT EXISTS tontine_targeted_holds (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  case_id uuid NOT NULL REFERENCES tontine_cases(id),
  scope text NOT NULL CHECK (scope IN ('payout','contribution','membership','provider_reference')),
  reference text NOT NULL,
  reason text NOT NULL,
  expires_at timestamptz,
  released_at timestamptz,
  UNIQUE (organization_id, scope, reference)
);

CREATE TABLE IF NOT EXISTS tontine_refund_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  case_id uuid NOT NULL REFERENCES tontine_cases(id),
  original_contribution_id uuid,
  original_payout_id uuid,
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  reason text NOT NULL,
  state text NOT NULL CHECK (state IN (
    'requested','reviewing','approved','rejected','submitted_to_financial_core','settled','failed'
  )),
  requires_human_approval boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tontine_refunds_queue
  ON tontine_refund_requests (organization_id, state, created_at);

COMMENT ON TABLE tontine_refund_requests IS
  'Refund workflow only. Actual financial reversal/refund is executed by Financial Core.';
