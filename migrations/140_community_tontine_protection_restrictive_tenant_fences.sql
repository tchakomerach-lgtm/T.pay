-- 140: Restrictive tenant fences for Community Tontine protection and closeout data.
-- Existing permissive policies may grant access by OR. These restrictive policies
-- intersect every permissive policy, so organization isolation cannot be bypassed
-- by adding an unrelated permissive policy in a later migration.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'community_tontine_protection_policies',
    'community_tontine_protection_enrollments',
    'community_tontine_protection_premiums',
    'community_tontine_protection_claims',
    'community_tontine_protection_events',
    'community_tontine_protection_products',
    'community_tontine_individual_coverages',
    'community_tontine_individual_coverage_installments',
    'community_tontine_cycle_closeouts',
    'community_tontine_cycle_refund_allocations',
    'community_tontine_protection_financial_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_fence', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL USING (organization_id = public.tpay_current_organization_id()) WITH CHECK (organization_id = public.tpay_current_organization_id())',
      t || '_tenant_fence', t
    );
  END LOOP;
END;
$$;

COMMENT ON POLICY community_tontine_protection_policies_tenant_fence
  ON community_tontine_protection_policies IS
  'Restrictive tenant fence: intersects all permissive policies and denies cross-organization access.';
