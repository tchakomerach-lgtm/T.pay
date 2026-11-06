-- P057.2 — enforce tenant RLS for persisted device/session authentication.
-- The application must SET LOCAL ROLE tpay_school_runtime and set the verified
-- tenant GUC inside one transaction before session lookup or last_seen mutation.

ALTER TABLE api_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE api_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_devices_runtime_tenant_scope ON api_devices;
CREATE POLICY api_devices_runtime_tenant_scope ON api_devices
  FOR SELECT TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), ''));

DROP POLICY IF EXISTS api_sessions_runtime_tenant_scope ON api_sessions;
CREATE POLICY api_sessions_runtime_tenant_scope ON api_sessions
  FOR SELECT TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), ''));

DROP POLICY IF EXISTS api_sessions_runtime_last_seen_update ON api_sessions;
CREATE POLICY api_sessions_runtime_last_seen_update ON api_sessions
  FOR UPDATE TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), ''));

GRANT SELECT ON api_devices TO tpay_school_runtime;
GRANT SELECT ON api_sessions TO tpay_school_runtime;
GRANT UPDATE (last_seen_at) ON api_sessions TO tpay_school_runtime;

COMMENT ON POLICY api_devices_runtime_tenant_scope ON api_devices IS
  'Authentication can inspect only devices in the verified tenant claim.';
COMMENT ON POLICY api_sessions_runtime_tenant_scope ON api_sessions IS
  'Authentication can inspect only sessions in the verified tenant claim.';
COMMENT ON POLICY api_sessions_runtime_last_seen_update ON api_sessions IS
  'Authentication may update only last_seen_at inside the verified tenant scope.';
