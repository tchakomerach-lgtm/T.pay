-- Organization-scoped RLS for Community Tontine admission evidence.
-- Uses the repository's established tpay_current_organization_id() security context.
-- RLS is enabled consistently with the existing Fortress policies; runtime roles must not own these tables.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'community_tontine_candidates',
    'community_tontine_consents',
    'community_tontine_trust_attestations',
    'community_tontine_admission_audit',
    'community_tontine_launch_snapshots'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS community_tontine_candidates_org_scope ON community_tontine_candidates;
CREATE POLICY community_tontine_candidates_org_scope
  ON community_tontine_candidates
  USING (organization_id = tpay_current_organization_id())
  WITH CHECK (organization_id = tpay_current_organization_id());

DROP POLICY IF EXISTS community_tontine_consents_org_scope ON community_tontine_consents;
CREATE POLICY community_tontine_consents_org_scope
  ON community_tontine_consents
  USING (organization_id = tpay_current_organization_id())
  WITH CHECK (organization_id = tpay_current_organization_id());

DROP POLICY IF EXISTS community_tontine_attestations_org_scope ON community_tontine_trust_attestations;
CREATE POLICY community_tontine_attestations_org_scope
  ON community_tontine_trust_attestations
  USING (organization_id = tpay_current_organization_id())
  WITH CHECK (organization_id = tpay_current_organization_id());

DROP POLICY IF EXISTS community_tontine_admission_audit_org_scope ON community_tontine_admission_audit;
CREATE POLICY community_tontine_admission_audit_org_scope
  ON community_tontine_admission_audit
  USING (organization_id = tpay_current_organization_id())
  WITH CHECK (organization_id = tpay_current_organization_id());

DROP POLICY IF EXISTS community_tontine_launch_snapshots_org_scope ON community_tontine_launch_snapshots;
CREATE POLICY community_tontine_launch_snapshots_org_scope
  ON community_tontine_launch_snapshots
  USING (organization_id = tpay_current_organization_id())
  WITH CHECK (organization_id = tpay_current_organization_id());

COMMENT ON POLICY community_tontine_candidates_org_scope ON community_tontine_candidates IS
  'Candidate rows are visible and mutable only in the authenticated active organization context.';
COMMENT ON POLICY community_tontine_consents_org_scope ON community_tontine_consents IS
  'Consent evidence is scoped to the authenticated active organization; consent terms remain immutable under migration 128.';
COMMENT ON POLICY community_tontine_attestations_org_scope ON community_tontine_trust_attestations IS
  'Partner attestations are scoped to the authenticated active organization and append-only under migration 128.';
COMMENT ON POLICY community_tontine_admission_audit_org_scope ON community_tontine_admission_audit IS
  'Admission audit evidence is scoped to the authenticated active organization and append-only under migration 127.';
COMMENT ON POLICY community_tontine_launch_snapshots_org_scope ON community_tontine_launch_snapshots IS
  'Launch snapshots are scoped to the authenticated active organization and immutable under migration 128.';
