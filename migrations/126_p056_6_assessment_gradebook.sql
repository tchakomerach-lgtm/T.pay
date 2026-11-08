-- P056.6 — assessment and gradebook records.
-- Academic results only. Fees and all monetary obligations remain in Financial Core.

CREATE TABLE IF NOT EXISTS education_assessments (
  assessment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  class_id text NOT NULL,
  academic_year text NOT NULL CHECK (
    academic_year ~ '^[0-9]{4}-[0-9]{4}$'
    AND substring(academic_year from 6 for 4)::integer = substring(academic_year from 1 for 4)::integer + 1
  ),
  subject_code text NOT NULL,
  period_code text NOT NULL CHECK (period_code ~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  assessment_date date NOT NULL,
  max_score numeric(7,2) NOT NULL CHECK (max_score > 0 AND max_score <= 1000),
  coefficient numeric(5,2) NOT NULL CHECK (coefficient > 0 AND coefficient <= 100),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','LOCKED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, organization_id, assessment_id),
  CONSTRAINT education_assessments_class_scope_fk
    FOREIGN KEY (tenant_id, organization_id, class_id, academic_year)
    REFERENCES education_classes (tenant_id, organization_id, class_id, academic_year) ON DELETE RESTRICT,
  CONSTRAINT education_assessments_subject_scope_fk
    FOREIGN KEY (tenant_id, organization_id, subject_code)
    REFERENCES education_subjects (tenant_id, organization_id, subject_code) ON DELETE RESTRICT,
  CONSTRAINT education_assessments_creator_scope_fk
    FOREIGN KEY (tenant_id, organization_id, created_by)
    REFERENCES education_actors (tenant_id, organization_id, actor_id) ON DELETE RESTRICT,
  CONSTRAINT education_assessments_locker_scope_fk
    FOREIGN KEY (tenant_id, organization_id, locked_by)
    REFERENCES education_actors (tenant_id, organization_id, actor_id) ON DELETE RESTRICT,
  CONSTRAINT education_assessments_lock_state_check
    CHECK ((status='OPEN' AND locked_by IS NULL AND locked_at IS NULL)
        OR (status='LOCKED' AND locked_by IS NOT NULL AND locked_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_education_assessments_class_period
  ON education_assessments (tenant_id, organization_id, class_id, academic_year, period_code, subject_code, assessment_date DESC);

CREATE TABLE IF NOT EXISTS education_grades (
  grade_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  assessment_id uuid NOT NULL,
  enrollment_id text NOT NULL,
  score numeric(7,2) NOT NULL CHECK (score >= 0),
  teacher_comment text CHECK (teacher_comment IS NULL OR length(teacher_comment) <= 1000),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  entered_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, organization_id, grade_id),
  UNIQUE (tenant_id, organization_id, assessment_id, enrollment_id),
  CONSTRAINT education_grades_assessment_scope_fk
    FOREIGN KEY (tenant_id, organization_id, assessment_id)
    REFERENCES education_assessments (tenant_id, organization_id, assessment_id) ON DELETE RESTRICT,
  CONSTRAINT education_grades_enrollment_scope_fk
    FOREIGN KEY (tenant_id, organization_id, enrollment_id)
    REFERENCES education_enrollments (tenant_id, organization_id, enrollment_id) ON DELETE RESTRICT,
  CONSTRAINT education_grades_entered_by_scope_fk
    FOREIGN KEY (tenant_id, organization_id, entered_by)
    REFERENCES education_actors (tenant_id, organization_id, actor_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_education_grades_assessment
  ON education_grades (tenant_id, organization_id, assessment_id, enrollment_id);

ALTER TABLE education_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_assessments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS education_assessments_runtime_scope ON education_assessments;
CREATE POLICY education_assessments_runtime_scope ON education_assessments
  FOR ALL TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
     AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
          AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''));
GRANT SELECT, INSERT, UPDATE ON education_assessments TO tpay_school_runtime;

ALTER TABLE education_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_grades FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS education_grades_runtime_scope ON education_grades;
CREATE POLICY education_grades_runtime_scope ON education_grades
  FOR ALL TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
     AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
          AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''));
GRANT SELECT, INSERT, UPDATE ON education_grades TO tpay_school_runtime;


-- Database-level invariants: a grade belongs to an active enrollment in the
-- assessment class/year, is bounded by max_score, and cannot change after lock.
CREATE OR REPLACE FUNCTION guard_education_grade_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  assessment_row education_assessments%ROWTYPE;
  enrollment_row education_enrollments%ROWTYPE;
BEGIN
  SELECT * INTO assessment_row
    FROM education_assessments
   WHERE tenant_id=NEW.tenant_id
     AND organization_id=NEW.organization_id
     AND assessment_id=NEW.assessment_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EDUCATION_ASSESSMENT_SCOPE_NOT_FOUND';
  END IF;
  IF assessment_row.status <> 'OPEN' THEN
    RAISE EXCEPTION 'EDUCATION_ASSESSMENT_LOCKED';
  END IF;
  IF NEW.score > assessment_row.max_score THEN
    RAISE EXCEPTION 'EDUCATION_GRADE_SCORE_OUT_OF_RANGE';
  END IF;

  SELECT * INTO enrollment_row
    FROM education_enrollments
   WHERE tenant_id=NEW.tenant_id
     AND organization_id=NEW.organization_id
     AND enrollment_id=NEW.enrollment_id
   FOR UPDATE;
  IF NOT FOUND
     OR enrollment_row.status <> 'ACTIVE'
     OR enrollment_row.class_id <> assessment_row.class_id
     OR enrollment_row.academic_year <> assessment_row.academic_year THEN
    RAISE EXCEPTION 'EDUCATION_GRADE_ACTIVE_ENROLLMENT_REQUIRED';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_education_grade_write_guard ON education_grades;
CREATE TRIGGER trg_education_grade_write_guard
BEFORE INSERT OR UPDATE ON education_grades
FOR EACH ROW EXECUTE FUNCTION guard_education_grade_write();

COMMENT ON TABLE education_assessments IS
  'Organization-scoped academic assessment definitions. No fees or monetary settlement data.';
COMMENT ON TABLE education_grades IS
  'Versioned student assessment results. Grade entry requires an active enrollment and authorized class/subject teaching assignment.';
