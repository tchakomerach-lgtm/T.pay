-- P055 — School terrain relationship and student data boundary.
-- Parent-child access is explicit, tenant/org scoped, and never inferred from user identity.
ALTER TABLE education_students
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Composite keys make tenant and organization scope a database invariant,
-- not merely an application query convention.
CREATE UNIQUE INDEX IF NOT EXISTS uq_education_actors_scope_actor
  ON education_actors (tenant_id, organization_id, actor_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_education_students_scope_student
  ON education_students (tenant_id, organization_id, student_id);

CREATE TABLE IF NOT EXISTS education_parent_student_links (
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  parent_actor_id text NOT NULL,
  student_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, organization_id, parent_actor_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_education_parent_student_parent
  ON education_parent_student_links (tenant_id, organization_id, parent_actor_id, active);

CREATE INDEX IF NOT EXISTS idx_education_parent_student_student
  ON education_parent_student_links (tenant_id, organization_id, student_id, active);

DO $p055$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_p055_parent_actor_scope') THEN
    ALTER TABLE education_parent_student_links
      ADD CONSTRAINT fk_p055_parent_actor_scope
      FOREIGN KEY (tenant_id, organization_id, parent_actor_id)
      REFERENCES education_actors (tenant_id, organization_id, actor_id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_p055_parent_student_scope') THEN
    ALTER TABLE education_parent_student_links
      ADD CONSTRAINT fk_p055_parent_student_scope
      FOREIGN KEY (tenant_id, organization_id, student_id)
      REFERENCES education_students (tenant_id, organization_id, student_id)
      ON DELETE RESTRICT;
  END IF;
END
$p055$;

ALTER TABLE education_parent_student_links ENABLE ROW LEVEL SECURITY;

-- Teacher access is scoped to an explicit, active student assignment.
-- Membership in an organization alone never grants access to every child's record.
CREATE TABLE IF NOT EXISTS education_teacher_student_assignments (
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  teacher_actor_id text NOT NULL,
  student_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, organization_id, teacher_actor_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_education_teacher_student_teacher
  ON education_teacher_student_assignments (tenant_id, organization_id, teacher_actor_id, active);

CREATE INDEX IF NOT EXISTS idx_education_teacher_student_student
  ON education_teacher_student_assignments (tenant_id, organization_id, student_id, active);

DO $p055$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_p055_teacher_actor_scope') THEN
    ALTER TABLE education_teacher_student_assignments
      ADD CONSTRAINT fk_p055_teacher_actor_scope
      FOREIGN KEY (tenant_id, organization_id, teacher_actor_id)
      REFERENCES education_actors (tenant_id, organization_id, actor_id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_p055_teacher_student_scope') THEN
    ALTER TABLE education_teacher_student_assignments
      ADD CONSTRAINT fk_p055_teacher_student_scope
      FOREIGN KEY (tenant_id, organization_id, student_id)
      REFERENCES education_students (tenant_id, organization_id, student_id)
      ON DELETE RESTRICT;
  END IF;
END
$p055$;

ALTER TABLE education_teacher_student_assignments ENABLE ROW LEVEL SECURITY;
