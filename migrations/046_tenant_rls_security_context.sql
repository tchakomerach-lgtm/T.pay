CREATE OR REPLACE FUNCTION tpay_current_organization_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('tpay.organization_id', true), '');
$$;

CREATE OR REPLACE FUNCTION tpay_current_actor_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('tpay.actor_id', true), '');
$$;

ALTER TABLE security_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_audit_events_tenant_isolation ON security_audit_events;
CREATE POLICY security_audit_events_tenant_isolation
ON security_audit_events
USING (organization_id = tpay_current_organization_id())
WITH CHECK (organization_id = tpay_current_organization_id());

ALTER TABLE security_replay_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_replay_claims_tenant_isolation ON security_replay_claims;
CREATE POLICY security_replay_claims_tenant_isolation
ON security_replay_claims
USING (split_part(scope, ':', 1) = 'org' AND split_part(scope, ':', 2) = tpay_current_organization_id())
WITH CHECK (split_part(scope, ':', 1) = 'org' AND split_part(scope, ':', 2) = tpay_current_organization_id());

COMMENT ON FUNCTION tpay_current_organization_id() IS
'Returns the transaction-local T.Pay organization context. Application roles must not bypass RLS.';
