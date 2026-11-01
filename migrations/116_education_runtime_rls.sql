-- P056 security hardening: runtime role and tenant/organization RLS.
-- Apply after 115_education_classes_enrollments.sql.
-- The migration role must be allowed to create roles and alter table ownership/policies.
-- Runtime connections must SET LOCAL tpay.tenant_id and tpay.organization_id
-- inside every transaction, using values derived from verified Identity/Auth claims.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tpay_school_runtime') THEN
    CREATE ROLE tpay_school_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS INHERIT;
  END IF;
END
$$;

ALTER ROLE tpay_school_runtime NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;

ALTER TABLE education_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_classes FORCE ROW LEVEL SECURITY;
ALTER TABLE education_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_enrollments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS education_classes_runtime_scope ON education_classes;
CREATE POLICY education_classes_runtime_scope ON education_classes
  FOR ALL TO tpay_school_runtime
  USING (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  );

DROP POLICY IF EXISTS education_enrollments_runtime_scope ON education_enrollments;
CREATE POLICY education_enrollments_runtime_scope ON education_enrollments
  FOR ALL TO tpay_school_runtime
  USING (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON education_classes TO tpay_school_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON education_enrollments TO tpay_school_runtime;

COMMENT ON POLICY education_classes_runtime_scope ON education_classes IS
  'Fail-closed tenant and organization isolation for the least-privilege school runtime role.';
COMMENT ON POLICY education_enrollments_runtime_scope ON education_enrollments IS
  'Fail-closed tenant and organization isolation for the least-privilege school runtime role.';

-- Do not grant membership to application login roles here. Deployment must explicitly
-- grant tpay_school_runtime to the dedicated API login and prove the effective role
-- cannot bypass RLS. The runtime must set both transaction-local GUCs from verified auth.
