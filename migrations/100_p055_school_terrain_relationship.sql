-- P055 — School terrain relationship and student data boundary.
-- Parent-child access is explicit, tenant/org scoped, and never inferred from user identity.
ALTER TABLE education_students
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;

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

ALTER TABLE education_teacher_student_assignments ENABLE ROW LEVEL SECURITY;
