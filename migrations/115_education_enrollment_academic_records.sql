-- P056 School enrollment, class assignment, guardian relationship and assessment foundation.
-- Monetary obligations remain references for finance settlement; this schema never mutates a wallet or ledger.

-- PostgreSQL requires a unique key for every composite tenant-bound reference.
-- The legacy primary keys are single-column, so add explicit tenant/org-scoped keys.
CREATE UNIQUE INDEX IF NOT EXISTS uq_education_students_tenant_org_student
  ON education_students(tenant_id, organization_id, student_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_education_actors_tenant_org_actor
  ON education_actors(tenant_id, organization_id, actor_id);

CREATE TABLE IF NOT EXISTS education_classes (
  class_id text NOT NULL,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  academic_year text NOT NULL,
  label text NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, organization_id, class_id),
  UNIQUE (tenant_id, organization_id, academic_year, label)
);

CREATE TABLE IF NOT EXISTS education_enrollments (
  enrollment_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  student_id text NOT NULL,
  class_id text NOT NULL,
  academic_year text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','CONFIRMED','TRANSFERRED','WITHDRAWN','COMPLETED')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, organization_id, enrollment_id),
  FOREIGN KEY (tenant_id, organization_id, student_id)
    REFERENCES education_students(tenant_id, organization_id, student_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, organization_id, class_id)
    REFERENCES education_classes(tenant_id, organization_id, class_id) ON DELETE RESTRICT,
  CHECK (ended_at IS NULL OR ended_at >= enrolled_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_education_active_student_year
  ON education_enrollments(tenant_id, organization_id, student_id, academic_year)
  WHERE status IN ('PENDING','CONFIRMED');
CREATE INDEX IF NOT EXISTS idx_education_enrollments_class
  ON education_enrollments(tenant_id, organization_id, class_id, academic_year, status);

CREATE TABLE IF NOT EXISTS education_guardian_links (
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  student_id text NOT NULL,
  guardian_actor_id text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('MOTHER','FATHER','LEGAL_GUARDIAN','OTHER')),
  can_view_attendance boolean NOT NULL DEFAULT true,
  can_view_grades boolean NOT NULL DEFAULT true,
  can_view_billing boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','REVOKED')),
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, organization_id, student_id, guardian_actor_id),
  FOREIGN KEY (tenant_id, organization_id, student_id)
    REFERENCES education_students(tenant_id, organization_id, student_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, organization_id, guardian_actor_id)
    REFERENCES education_actors(tenant_id, organization_id, actor_id) ON DELETE RESTRICT,
  CHECK ((status <> 'ACTIVE') OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_education_guardian_actor
  ON education_guardian_links(tenant_id, organization_id, guardian_actor_id, status);

CREATE TABLE IF NOT EXISTS education_assessments (
  assessment_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  student_id text NOT NULL,
  class_id text NOT NULL,
  academic_year text NOT NULL,
  term_code text NOT NULL,
  subject_code text NOT NULL,
  score numeric(8,2) NOT NULL CHECK (score >= 0),
  maximum_score numeric(8,2) NOT NULL CHECK (maximum_score > 0 AND score <= maximum_score),
  coefficient numeric(6,3) NOT NULL DEFAULT 1 CHECK (coefficient > 0),
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (tenant_id, organization_id, student_id)
    REFERENCES education_students(tenant_id, organization_id, student_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, organization_id, class_id)
    REFERENCES education_classes(tenant_id, organization_id, class_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, organization_id, assessment_id)
);
CREATE INDEX IF NOT EXISTS idx_education_assessments_student_term
  ON education_assessments(tenant_id, organization_id, student_id, academic_year, term_code);

CREATE TABLE IF NOT EXISTS education_fee_obligations (
  obligation_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  student_id text NOT NULL,
  academic_year text NOT NULL,
  fee_code text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIALLY_SETTLED','SETTLED','WAIVED','CANCELLED')),
  finance_reference text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (tenant_id, organization_id, student_id)
    REFERENCES education_students(tenant_id, organization_id, student_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, organization_id, obligation_id)
);
CREATE INDEX IF NOT EXISTS idx_education_fee_student_status
  ON education_fee_obligations(tenant_id, organization_id, student_id, status);

COMMENT ON TABLE education_guardian_links IS
  'Parent/guardian access is explicit, relationship-scoped and requires verification before activation.';
COMMENT ON TABLE education_fee_obligations IS
  'School fee obligations are not ledger entries; settlement must go through the Finance payment and ledger services.';
