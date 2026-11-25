-- Organization-scoped RLS for Community Tontine admission evidence.
-- The active organization is transaction-local server context. Missing context fails closed.
-- API transaction adapters must set_config('tpay.organization_id', authenticatedOrganizationId, true)
-- only after validating the authenticated multi-organization principal.
CREATE OR REPLACE FUNCTION public.tpay_current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $function$
  SELECT NULLIF(current_setting('tpay.organization_id', true), '')::uuid
$function$;

COMMENT ON FUNCTION public.tpay_current_organization_id() IS
  'Returns the authenticated organization from transaction-local T.Pay DB context; NULL when absent so RLS denies access. API adapters must set it only from a validated principal.';

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
  USING (organization_id = public.tpay_current_organization_id())
  WITH CHECK (organization_id = public.tpay_current_organization_id());

DROP POLICY IF EXISTS community_tontine_consents_org_scope ON community_tontine_consents;
CREATE POLICY community_tontine_consents_org_scope
  ON community_tontine_consents
  USING (organization_id = public.tpay_current_organization_id())
  WITH CHECK (organization_id = public.tpay_current_organization_id());

DROP POLICY IF EXISTS community_tontine_attestations_org_scope ON community_tontine_trust_attestations;
CREATE POLICY community_tontine_attestations_org_scope
  ON community_tontine_trust_attestations
  USING (organization_id = public.tpay_current_organization_id())
  WITH CHECK (organization_id = public.tpay_current_organization_id());

DROP POLICY IF EXISTS community_tontine_admission_audit_org_scope ON community_tontine_admission_audit;
CREATE POLICY community_tontine_admission_audit_org_scope
  ON community_tontine_admission_audit
  USING (organization_id = public.tpay_current_organization_id())
  WITH CHECK (organization_id = public.tpay_current_organization_id());

DROP POLICY IF EXISTS community_tontine_launch_snapshots_org_scope ON community_tontine_launch_snapshots;
CREATE POLICY community_tontine_launch_snapshots_org_scope
  ON community_tontine_launch_snapshots
  USING (organization_id = public.tpay_current_organization_id())
  WITH CHECK (organization_id = public.tpay_current_organization_id());

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
