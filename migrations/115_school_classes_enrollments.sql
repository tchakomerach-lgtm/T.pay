-- School OS class catalog and enrollment history.
-- Read paths are tenant-scoped with transaction-local RLS context.
-- Rollback: DROP TABLE education_enrollments; DROP TABLE education_classes;
-- then ALTER TABLE education_students DROP CONSTRAINT education_students_tenant_org_student_uq.

ALTER TABLE education_students
  ADD CONSTRAINT education_students_tenant_org_student_uq
  UNIQUE (tenant_id, organization_id, student_id);

CREATE TABLE IF NOT EXISTS education_classes (
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  class_id text NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  grade_level text NOT NULL CHECK (length(trim(grade_level)) BETWEEN 1 AND 80),
  academic_year text NOT NULL CHECK (academic_year ~ '^\d{4}[-/]\d{4}$'),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, organization_id, class_id),
  UNIQUE (tenant_id, organization_id, academic_year, name)
);

CREATE INDEX IF NOT EXISTS idx_education_classes_year_status
  ON education_classes (tenant_id, organization_id, academic_year, status, grade_level);

CREATE TABLE IF NOT EXISTS education_enrollments (
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  enrollment_id text NOT NULL,
  student_id text NOT NULL,
  class_id text NOT NULL,
  academic_year text NOT NULL CHECK (academic_year ~ '^\d{4}[-/]\d{4}$'),
  state text NOT NULL CHECK (state IN ('ENROLLED','TRANSFERRED','WITHDRAWN','COMPLETED')),
  started_at date NOT NULL,
  ended_at date,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, organization_id, enrollment_id),
  FOREIGN KEY (tenant_id, organization_id, student_id)
    REFERENCES education_students (tenant_id, organization_id, student_id),
  FOREIGN KEY (tenant_id, organization_id, class_id)
    REFERENCES education_classes (tenant_id, organization_id, class_id),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK ((state='ENROLLED' AND ended_at IS NULL) OR state<>'ENROLLED')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_education_one_active_enrollment_per_year
  ON education_enrollments (tenant_id, organization_id, student_id, academic_year)
  WHERE state='ENROLLED';

CREATE INDEX IF NOT EXISTS idx_education_enrollments_class_state
  ON education_enrollments (tenant_id, organization_id, class_id, state, academic_year);

CREATE INDEX IF NOT EXISTS idx_education_enrollments_student_history
  ON education_enrollments (tenant_id, organization_id, student_id, academic_year DESC, created_at DESC);

ALTER TABLE education_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_classes FORCE ROW LEVEL SECURITY;
ALTER TABLE education_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_enrollments FORCE ROW LEVEL SECURITY;

CREATE POLICY education_classes_tenant_read
  ON education_classes FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  );

CREATE POLICY education_enrollments_tenant_read
  ON education_enrollments FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  );

COMMENT ON TABLE education_classes IS
  'Organization-scoped School OS class catalog. Class writes are intentionally not exposed by this read-only API brick.';
COMMENT ON TABLE education_enrollments IS
  'Append-preserving enrollment history with one active enrollment per student and academic year.';
