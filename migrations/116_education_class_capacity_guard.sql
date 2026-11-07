-- P057 Enforce class capacity under concurrent enrollment writes.
ALTER TABLE education_classes
  ADD COLUMN IF NOT EXISTS enrolled_count integer NOT NULL DEFAULT 0
  CHECK (enrolled_count >= 0 AND enrolled_count <= capacity);

CREATE OR REPLACE FUNCTION education_enrollment_capacity_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  was_active boolean := TG_OP <> 'INSERT' AND OLD.status IN ('PENDING','CONFIRMED');
  will_be_active boolean := TG_OP <> 'DELETE' AND NEW.status IN ('PENDING','CONFIRMED');
  class_tenant text;
  class_org text;
  class_id_value text;
  affected integer;
BEGIN
  IF TG_OP <> 'INSERT' AND was_active THEN
    IF TG_OP = 'UPDATE' AND will_be_active
       AND OLD.tenant_id = NEW.tenant_id
       AND OLD.organization_id = NEW.organization_id
       AND OLD.class_id = NEW.class_id THEN
      RETURN NEW;
    END IF;
    UPDATE education_classes
       SET enrolled_count = enrolled_count - 1, updated_at = now()
     WHERE tenant_id = OLD.tenant_id AND organization_id = OLD.organization_id
       AND class_id = OLD.class_id AND enrolled_count > 0;
  END IF;

  IF will_be_active THEN
    UPDATE education_classes
       SET enrolled_count = enrolled_count + 1, updated_at = now()
     WHERE tenant_id = NEW.tenant_id AND organization_id = NEW.organization_id
       AND class_id = NEW.class_id AND status = 'ACTIVE'
       AND enrolled_count < capacity;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN
      RAISE EXCEPTION 'EDUCATION_CLASS_CAPACITY_REACHED'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_education_enrollment_capacity_guard ON education_enrollments;
CREATE TRIGGER trg_education_enrollment_capacity_guard
BEFORE INSERT OR UPDATE OF status, class_id, tenant_id, organization_id OR DELETE
ON education_enrollments
FOR EACH ROW EXECUTE FUNCTION education_enrollment_capacity_guard();

-- Reconcile the counter once when deploying over pre-existing enrollment data.
UPDATE education_classes c
SET enrolled_count = (
  SELECT count(*)::integer
  FROM education_enrollments e
  WHERE e.tenant_id = c.tenant_id
    AND e.organization_id = c.organization_id
    AND e.class_id = c.class_id
    AND e.status IN ('PENDING','CONFIRMED')
);
