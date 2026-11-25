-- 141: Financial Core Payment Intent tenant isolation.
-- A permissive policy grants only the active organization; the restrictive policy
-- remains an invariant even if a future migration adds another permissive policy.
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_intents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_intents_organization_access ON payment_intents;
CREATE POLICY payment_intents_organization_access
  ON payment_intents
  AS PERMISSIVE
  FOR ALL
  USING (organization_id = public.tpay_current_organization_id())
  WITH CHECK (organization_id = public.tpay_current_organization_id());

DROP POLICY IF EXISTS payment_intents_tenant_fence ON payment_intents;
CREATE POLICY payment_intents_tenant_fence
  ON payment_intents
  AS RESTRICTIVE
  FOR ALL
  USING (organization_id = public.tpay_current_organization_id())
  WITH CHECK (organization_id = public.tpay_current_organization_id());

COMMENT ON POLICY payment_intents_tenant_fence ON payment_intents IS
  'Restrictive tenant fence: Financial Core Payment Intents are visible and mutable only inside the current organization context.';
