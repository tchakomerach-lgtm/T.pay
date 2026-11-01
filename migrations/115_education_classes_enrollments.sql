-- P056 — tenant-safe school classes and enrollment lifecycle.
-- This migration adds no payment, fee, wallet, or ledger write path.

CREATE UNIQUE INDEX IF NOT EXISTS uq_education_actors_scope_actor
  ON education_actors (tenant_id, organization_id, actor_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_education_students_scope_student
  ON education_students (tenant_id, organization_id, student_id);

CREATE TABLE IF NOT EXISTS education_classes (
  class_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  academic_year text NOT NULL CHECK (academic_year ~ '^[0-9]{4}-[0-9]{4}$'),
  code text NOT NULL CHECK (length(code) BETWEEN 1 AND 32),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  level text NOT NULL CHECK (length(level) BETWEEN 1 AND 80),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 3000),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_by text NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, organization_id, class_id),
  UNIQUE (tenant_id, organization_id, class_id, academic_year),
  UNIQUE (tenant_id, organization_id, academic_year, code),
  CONSTRAINT education_classes_creator_scope_fk
    FOREIGN KEY (tenant_id, organization_id, created_by)
    REFERENCES education_actors (tenant_id, organization_id, actor_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_education_classes_scope_year
  ON education_classes (tenant_id, organization_id, academic_year, status, code);

CREATE TABLE IF NOT EXISTS education_enrollments (
  enrollment_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  student_id text NOT NULL,
  class_id text NOT NULL,
  academic_year text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','WITHDRAWN','COMPLETED','CANCELLED')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, organization_id, enrollment_id),
  CONSTRAINT education_enrollments_class_scope_fk
    FOREIGN KEY (tenant_id, organization_id, class_id, academic_year)
    REFERENCES education_classes (tenant_id, organization_id, class_id, academic_year)
    ON DELETE RESTRICT,
  CONSTRAINT education_enrollments_student_scope_fk
    FOREIGN KEY (tenant_id, organization_id, student_id)
    REFERENCES education_students (tenant_id, organization_id, student_id)
    ON DELETE RESTRICT,
  CONSTRAINT education_enrollments_creator_scope_fk
    FOREIGN KEY (tenant_id, organization_id, created_by)
    REFERENCES education_actors (tenant_id, organization_id, actor_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_education_active_student_year
  ON education_enrollments (tenant_id, organization_id, student_id, academic_year)
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_education_enrollments_class
  ON education_enrollments (tenant_id, organization_id, class_id, status, enrolled_at DESC);
CREATE INDEX IF NOT EXISTS idx_education_enrollments_student
  ON education_enrollments (tenant_id, organization_id, student_id, academic_year);

CREATE OR REPLACE FUNCTION guard_education_enrollment_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  class_capacity integer;
  class_status text;
  active_count integer;
BEGIN
  SELECT capacity, status INTO class_capacity, class_status
    FROM education_classes
   WHERE tenant_id = NEW.tenant_id
     AND organization_id = NEW.organization_id
     AND class_id = NEW.class_id
     AND academic_year = NEW.academic_year
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EDUCATION_CLASS_SCOPE_NOT_FOUND';
  END IF;
  IF class_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'EDUCATION_CLASS_NOT_ACTIVE';
  END IF;
  IF NEW.status = 'ACTIVE' THEN
    SELECT count(*)::integer INTO active_count
      FROM education_enrollments
     WHERE tenant_id = NEW.tenant_id
       AND organization_id = NEW.organization_id
       AND class_id = NEW.class_id
       AND academic_year = NEW.academic_year
       AND status = 'ACTIVE'
       AND enrollment_id <> NEW.enrollment_id;
    IF active_count >= class_capacity THEN
      RAISE EXCEPTION 'EDUCATION_CLASS_CAPACITY_REACHED';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_education_enrollment_capacity ON education_enrollments;
CREATE TRIGGER trg_education_enrollment_capacity
BEFORE INSERT OR UPDATE OF tenant_id, organization_id, class_id, academic_year, status
ON education_enrollments
FOR EACH ROW EXECUTE FUNCTION guard_education_enrollment_capacity();

ALTER TABLE education_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_enrollments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE education_classes IS
  'Tenant-scoped academic class records. Financial charges are exclusively handled by Financial Core.';
COMMENT ON TABLE education_enrollments IS
  'Tenant-scoped student enrollment lifecycle. No fee, wallet, payment or ledger state is stored here.';
