CREATE TABLE IF NOT EXISTS opportunity_claims (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  subject_id text NOT NULL,
  issuer_id text NOT NULL,
  claim_type text NOT NULL,
  value text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz,
  status text NOT NULL,
  confidence numeric(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at >= issued_at),
  CHECK (status IN ('UNVERIFIED','LOW','PARTIAL','VERIFIED','STRONGLY_VERIFIED','CRYPTOGRAPHICALLY_VERIFIED'))
);

CREATE INDEX IF NOT EXISTS idx_opportunity_claims_subject
  ON opportunity_claims (tenant_id, organization_id, subject_id, claim_type);

CREATE TABLE IF NOT EXISTS opportunity_evidence (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  subject_id text NOT NULL,
  kind text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz NOT NULL,
  expires_at timestamptz,
  issuer_id text,
  origin text NOT NULL,
  integrity text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (origin IN ('user','organization','system','provider')),
  CHECK (integrity IN ('unknown','verified','tampered','quarantined'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunity_evidence_hash
  ON opportunity_evidence (tenant_id, organization_id, sha256);

CREATE TABLE IF NOT EXISTS opportunity_commitments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  actor_id text NOT NULL,
  opportunity_id text NOT NULL,
  action text NOT NULL,
  expected_result text NOT NULL,
  deadline timestamptz NOT NULL,
  status text NOT NULL,
  evidence_required boolean NOT NULL DEFAULT true,
  dependency_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('OPEN','AT_RISK','FULFILLED','BREACHED','CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_opportunity_commitments_deadline
  ON opportunity_commitments (tenant_id, organization_id, deadline, status);

CREATE TABLE IF NOT EXISTS opportunity_action_receipts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  actor_id text NOT NULL,
  agent_id text,
  intent text NOT NULL,
  action text NOT NULL,
  policy_decision text NOT NULL,
  expected_effect text NOT NULL,
  actual_effect text,
  data_class text NOT NULL,
  action_hash text NOT NULL CHECK (action_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (policy_decision IN ('ALLOW','DENY','REVIEW')),
  CHECK (data_class IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED'))
);

CREATE INDEX IF NOT EXISTS idx_opportunity_action_receipts_hash
  ON opportunity_action_receipts (tenant_id, organization_id, action_hash);

CREATE TABLE IF NOT EXISTS opportunity_agent_authorities (
  agent_id text NOT NULL,
  principal_id text NOT NULL,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  purpose text NOT NULL,
  resource text NOT NULL,
  actions jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  max_actions integer NOT NULL CHECK (max_actions > 0),
  max_value_minor bigint CHECK (max_value_minor IS NULL OR max_value_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, organization_id, agent_id, resource)
);

CREATE INDEX IF NOT EXISTS idx_opportunity_agent_authorities_expiry
  ON opportunity_agent_authorities (tenant_id, organization_id, expires_at);

COMMENT ON TABLE opportunity_claims IS 'OP-1216+ assurance claims; tenant/org scoped and provenance-bearing.';
COMMENT ON TABLE opportunity_evidence IS 'OP-1234+ evidence integrity records; binary payloads stay outside the relational row.';
COMMENT ON TABLE opportunity_commitments IS 'OP-1229+ operational commitments and deadline risk state.';
COMMENT ON TABLE opportunity_action_receipts IS 'OP-1256+ immutable intent/action authorization receipts.';
COMMENT ON TABLE opportunity_agent_authorities IS 'OP-1252+ short-lived, resource-scoped agent authority.';

CREATE OR REPLACE FUNCTION opportunity_action_receipt_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'OPPORTUNITY_ACTION_RECEIPT_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunity_action_receipt_immutable ON opportunity_action_receipts;
CREATE TRIGGER trg_opportunity_action_receipt_immutable
BEFORE UPDATE OR DELETE ON opportunity_action_receipts
FOR EACH ROW EXECUTE FUNCTION opportunity_action_receipt_immutable();

COMMENT ON FUNCTION opportunity_action_receipt_immutable() IS 'OP-1256 append-only enforcement for autonomous action receipts.';
