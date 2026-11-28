-- 142: evidence-backed CT-042 insurer verification and separated governance.
-- Evidence is metadata for immutable documents stored in the approved private document vault.
-- A hash alone is not proof of authenticity; an authorized reviewer must compare the source documents.
CREATE TABLE IF NOT EXISTS community_tontine_insurer_verification_evidence (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  group_id uuid NOT NULL,
  policy_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('INSURER_LICENSE','EXECUTED_CONTRACT')),
  evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) BETWEEN 1 AND 512),
  evidence_sha256 char(64) NOT NULL CHECK (evidence_sha256 ~ '^[a-fA-F0-9]{64}$'),
  verified_by uuid NOT NULL,
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,group_id,policy_id)
    REFERENCES community_tontine_protection_policies(organization_id,group_id,id) ON DELETE RESTRICT,
  UNIQUE (organization_id,group_id,id)
);

CREATE INDEX IF NOT EXISTS idx_tontine_insurer_evidence_policy
  ON community_tontine_insurer_verification_evidence(organization_id,group_id,policy_id,verified_at);

ALTER TABLE community_tontine_insurer_verification_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_tontine_insurer_verification_evidence FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_tontine_insurer_evidence_organization_scope
  ON community_tontine_insurer_verification_evidence;
DROP POLICY IF EXISTS community_tontine_insurer_evidence_tenant_fence
  ON community_tontine_insurer_verification_evidence;
CREATE POLICY community_tontine_insurer_evidence_organization_scope
  ON community_tontine_insurer_verification_evidence AS PERMISSIVE FOR ALL
  USING (organization_id = public.tpay_current_organization_id())
  WITH CHECK (organization_id = public.tpay_current_organization_id());
CREATE POLICY community_tontine_insurer_evidence_tenant_fence
  ON community_tontine_insurer_verification_evidence AS RESTRICTIVE FOR ALL
  USING (organization_id = public.tpay_current_organization_id())
  WITH CHECK (organization_id = public.tpay_current_organization_id());

CREATE OR REPLACE FUNCTION community_tontine_insurer_evidence_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COMMUNITY_TONTINE_INSURER_EVIDENCE_IMMUTABLE';
END;
$$;
DROP TRIGGER IF EXISTS community_tontine_insurer_evidence_immutable_trigger
  ON community_tontine_insurer_verification_evidence;
CREATE TRIGGER community_tontine_insurer_evidence_immutable_trigger
BEFORE UPDATE OR DELETE OR TRUNCATE ON community_tontine_insurer_verification_evidence
FOR EACH STATEMENT EXECUTE FUNCTION community_tontine_insurer_evidence_immutable();

COMMENT ON TABLE community_tontine_insurer_verification_evidence IS
  'Immutable references and SHA-256 fingerprints for insurer licence and executed contract evidence reviewed by an authorized independent verifier.';

