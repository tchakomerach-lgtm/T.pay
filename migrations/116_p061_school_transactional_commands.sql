-- P061 School OS transactional class and enrollment commands.
-- No hard delete: classes are archived and enrollments retain their full history.
DROP POLICY IF EXISTS education_classes_tenant_update ON education_classes;
CREATE POLICY education_classes_tenant_update ON education_classes
  FOR UPDATE
  USING (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  );

DROP POLICY IF EXISTS education_enrollments_tenant_update ON education_enrollments;
CREATE POLICY education_enrollments_tenant_update ON education_enrollments
  FOR UPDATE
  USING (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  );

CREATE TABLE IF NOT EXISTS education_school_command_audit (
  command_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  actor_id text NOT NULL,
  command_type text NOT NULL,
  resource_id text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, organization_id, command_id)
);

ALTER TABLE education_school_command_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_school_command_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS education_school_command_audit_insert ON education_school_command_audit;
CREATE POLICY education_school_command_audit_insert ON education_school_command_audit
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  );

CREATE INDEX IF NOT EXISTS idx_school_command_audit_resource
  ON education_school_command_audit(tenant_id,organization_id,resource_id,created_at DESC);

COMMENT ON TABLE education_school_command_audit IS
  'Append-only audit evidence for School OS mutations. Inserted in the same PostgreSQL transaction as domain changes and outbox event.';

-- The command service must read student eligibility under the same tenant context.
DROP POLICY IF EXISTS education_students_tenant_read ON education_students;
CREATE POLICY education_students_tenant_read ON education_students
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  );

-- Runtime grants are applied only when the dedicated least-privilege role exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='tpay_school_runtime') THEN
    GRANT SELECT,INSERT,UPDATE ON education_classes,education_enrollments,education_students TO tpay_school_runtime;
    GRANT INSERT ON education_school_command_audit,education_sync_outbox TO tpay_school_runtime;
    GRANT SELECT,INSERT,UPDATE ON api_request_deduplication TO tpay_school_runtime;
  END IF;
END $$;
