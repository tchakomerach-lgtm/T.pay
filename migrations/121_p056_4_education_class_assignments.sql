-- P056.4 — tenant-isolated academic teaching assignments.
-- No fee, payment, wallet or ledger data belongs in this domain.

CREATE TABLE IF NOT EXISTS education_class_assignments (
  assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  class_id text NOT NULL,
  academic_year text NOT NULL CHECK (
    academic_year ~ '^[0-9]{4}-[0-9]{4}$'
    AND substring(academic_year from 6 for 4)::integer = substring(academic_year from 1 for 4)::integer + 1
  ),
  teacher_actor_id text NOT NULL,
  subject_code text NOT NULL CHECK (subject_code ~ '^[A-Za-z0-9._-]{1,32}$'),
  weekly_hours numeric(4,1) NOT NULL CHECK (weekly_hours > 0 AND weekly_hours <= 60),
  valid_from date NOT NULL,
  valid_until date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','COMPLETED')),
  created_by text NOT NULL,
  revoked_by text,
  revocation_reason text,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, organization_id, assignment_id),
  CONSTRAINT education_class_assignments_class_scope_fk
    FOREIGN KEY (tenant_id, organization_id, class_id, academic_year)
    REFERENCES education_classes (tenant_id, organization_id, class_id, academic_year)
    ON DELETE RESTRICT,
  CONSTRAINT education_class_assignments_teacher_scope_fk
    FOREIGN KEY (tenant_id, organization_id, teacher_actor_id)
    REFERENCES education_actors (tenant_id, organization_id, actor_id)
    ON DELETE RESTRICT,
  CONSTRAINT education_class_assignments_creator_scope_fk
    FOREIGN KEY (tenant_id, organization_id, created_by)
    REFERENCES education_actors (tenant_id, organization_id, actor_id)
    ON DELETE RESTRICT,
  CONSTRAINT education_class_assignments_revoker_scope_fk
    FOREIGN KEY (tenant_id, organization_id, revoked_by)
    REFERENCES education_actors (tenant_id, organization_id, actor_id)
    ON DELETE RESTRICT,
  CONSTRAINT education_class_assignments_dates_check
    CHECK (valid_until IS NULL OR valid_until >= valid_from),
  CONSTRAINT education_class_assignments_revocation_check
    CHECK ((status = 'REVOKED' AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)
        OR status <> 'REVOKED')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_education_active_class_subject_teacher
  ON education_class_assignments (tenant_id, organization_id, class_id, academic_year, subject_code, teacher_actor_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_education_assignments_class
  ON education_class_assignments (tenant_id, organization_id, class_id, academic_year, status);

CREATE INDEX IF NOT EXISTS idx_education_assignments_teacher
  ON education_class_assignments (tenant_id, organization_id, teacher_actor_id, academic_year, status);

ALTER TABLE education_class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_class_assignments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS education_class_assignments_runtime_scope ON education_class_assignments;
CREATE POLICY education_class_assignments_runtime_scope ON education_class_assignments
  FOR ALL TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
     AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
          AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''));

GRANT SELECT, INSERT, UPDATE ON education_class_assignments TO tpay_school_runtime;

COMMENT ON TABLE education_class_assignments IS
  'Teaching assignments scoped to one tenant, organization, academic class and year; all mutations are audited and Outbox-backed.';

-- The assignment API must validate that its teacher is active and belongs to the
-- same organization while using the runtime role, not an owner connection.
ALTER TABLE education_actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_actors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS education_actors_runtime_scope ON education_actors;
CREATE POLICY education_actors_runtime_scope ON education_actors
  FOR SELECT TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
     AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''));
GRANT SELECT ON education_actors TO tpay_school_runtime;
