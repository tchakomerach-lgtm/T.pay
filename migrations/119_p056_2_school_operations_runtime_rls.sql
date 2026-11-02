-- P056.2 — extend the least-privilege school runtime to the remaining transactional operations.
-- The role must receive tenant and organization GUCs inside every transaction.

ALTER TABLE education_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_attendance FORCE ROW LEVEL SECURITY;
ALTER TABLE education_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_work_items FORCE ROW LEVEL SECURITY;
ALTER TABLE education_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_service_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS education_attendance_runtime_scope ON education_attendance;
CREATE POLICY education_attendance_runtime_scope ON education_attendance
  FOR ALL TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
     AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
          AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''));

DROP POLICY IF EXISTS education_work_items_runtime_scope ON education_work_items;
CREATE POLICY education_work_items_runtime_scope ON education_work_items
  FOR ALL TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
     AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
          AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''));

DROP POLICY IF EXISTS education_service_requests_runtime_scope ON education_service_requests;
CREATE POLICY education_service_requests_runtime_scope ON education_service_requests
  FOR ALL TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
     AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
          AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON education_attendance TO tpay_school_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON education_work_items TO tpay_school_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON education_service_requests TO tpay_school_runtime;

COMMENT ON POLICY education_attendance_runtime_scope ON education_attendance IS
  'Fail-closed tenant and organization isolation for school attendance writes.';
COMMENT ON POLICY education_work_items_runtime_scope ON education_work_items IS
  'Fail-closed tenant and organization isolation for school work-item writes.';
COMMENT ON POLICY education_service_requests_runtime_scope ON education_service_requests IS
  'Fail-closed tenant and organization isolation for school service-request writes.';

-- Keep application-login membership explicit and separately provisioned by deployment.
-- Never run the API pool as a database owner, superuser or BYPASSRLS role.
