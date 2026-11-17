-- P055 follow-up: enforce tenant/organization consistency for education relationships.
-- Keep migration 100 immutable so installations that already recorded its checksum remain upgradeable.

CREATE UNIQUE INDEX IF NOT EXISTS uq_education_actors_scope_actor
  ON education_actors (tenant_id, organization_id, actor_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_education_students_scope_student
  ON education_students (tenant_id, organization_id, student_id);

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
