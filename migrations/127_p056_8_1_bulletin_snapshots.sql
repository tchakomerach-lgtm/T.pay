-- P056.8.1 — immutable, organization-scoped bulletin revisions.
-- Academic document storage only. No payment, fee, or ledger mutation.
CREATE TABLE IF NOT EXISTS education_bulletin_snapshots (
  bulletin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  student_id text NOT NULL,
  class_id text NOT NULL,
  academic_year text NOT NULL CHECK (
    academic_year ~ '^[0-9]{4}-[0-9]{4}$'
    AND substring(academic_year from 6 for 4)::integer = substring(academic_year from 1 for 4)::integer + 1
  ),
  period_code text NOT NULL CHECK (period_code ~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'),
  revision integer NOT NULL CHECK (revision > 0),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  snapshot_schema_version integer NOT NULL CHECK (snapshot_schema_version > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  state text NOT NULL DEFAULT 'PUBLISHED' CHECK (state IN ('PUBLISHED','VOID')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_by text,
  voided_at timestamptz,
  void_reason_code text,
  PRIMARY KEY (tenant_id, organization_id, bulletin_id),
  UNIQUE (tenant_id, organization_id, student_id, academic_year, period_code, revision),
  UNIQUE (tenant_id, organization_id, student_id, academic_year, period_code, content_hash),
  CONSTRAINT education_bulletin_class_scope_fk
    FOREIGN KEY (tenant_id, organization_id, class_id, academic_year)
    REFERENCES education_classes (tenant_id, organization_id, class_id, academic_year) ON DELETE RESTRICT,
  CONSTRAINT education_bulletin_creator_scope_fk
    FOREIGN KEY (tenant_id, organization_id, created_by)
    REFERENCES education_actors (tenant_id, organization_id, actor_id) ON DELETE RESTRICT,
  CONSTRAINT education_bulletin_voider_scope_fk
    FOREIGN KEY (tenant_id, organization_id, voided_by)
    REFERENCES education_actors (tenant_id, organization_id, actor_id) ON DELETE RESTRICT,
  CONSTRAINT education_bulletin_void_state_check CHECK (
    (state = 'PUBLISHED' AND voided_by IS NULL AND voided_at IS NULL AND void_reason_code IS NULL)
    OR
    (state = 'VOID' AND voided_by IS NOT NULL AND voided_at IS NOT NULL
      AND void_reason_code IS NOT NULL
      AND void_reason_code ~ '^[A-Z0-9_]{3,80}
  )
);
CREATE INDEX IF NOT EXISTS idx_education_bulletins_student_period
  ON education_bulletin_snapshots
  (tenant_id, organization_id, student_id, academic_year, period_code, revision DESC);
CREATE INDEX IF NOT EXISTS idx_education_bulletins_class_period
  ON education_bulletin_snapshots
  (tenant_id, organization_id, class_id, academic_year, period_code, created_at DESC);

ALTER TABLE education_bulletin_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_bulletin_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS education_bulletins_runtime_scope ON education_bulletin_snapshots;
CREATE POLICY education_bulletins_runtime_scope ON education_bulletin_snapshots
  FOR ALL TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
     AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
          AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''));
GRANT SELECT, INSERT ON education_bulletin_snapshots TO tpay_school_runtime;
GRANT UPDATE (state, voided_by, voided_at, void_reason_code) ON education_bulletin_snapshots TO tpay_school_runtime;

-- Snapshot payload and identity are immutable; only the explicit VOID transition is allowed.
CREATE OR REPLACE FUNCTION guard_education_bulletin_snapshot_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bulletin_id IS DISTINCT FROM OLD.bulletin_id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.class_id IS DISTINCT FROM OLD.class_id
    OR NEW.academic_year IS DISTINCT FROM OLD.academic_year
    OR NEW.period_code IS DISTINCT FROM OLD.period_code
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.snapshot_schema_version IS DISTINCT FROM OLD.snapshot_schema_version
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'EDUCATION_BULLETIN_SNAPSHOT_IMMUTABLE';
  END IF;
  IF OLD.state = 'VOID' OR NEW.state <> 'VOID'
    OR NEW.voided_by IS NULL OR NEW.voided_at IS NULL
    OR NEW.void_reason_code IS NULL
    OR NEW.void_reason_code !~ '^[A-Z0-9_]{3,80}
    RAISE EXCEPTION 'EDUCATION_BULLETIN_VOID_TRANSITION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_education_bulletin_snapshot_immutable ON education_bulletin_snapshots;
CREATE TRIGGER trg_education_bulletin_snapshot_immutable
BEFORE UPDATE ON education_bulletin_snapshots
FOR EACH ROW EXECUTE FUNCTION guard_education_bulletin_snapshot_update();

COMMENT ON TABLE education_bulletin_snapshots IS
  'Immutable versioned academic bulletin snapshots. Financial obligations remain exclusively in Financial Core.';
 THEN
    RAISE EXCEPTION 'EDUCATION_BULLETIN_VOID_TRANSITION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_education_bulletin_snapshot_immutable ON education_bulletin_snapshots;
CREATE TRIGGER trg_education_bulletin_snapshot_immutable
BEFORE UPDATE ON education_bulletin_snapshots
FOR EACH ROW EXECUTE FUNCTION guard_education_bulletin_snapshot_update();

COMMENT ON TABLE education_bulletin_snapshots IS
  'Immutable versioned academic bulletin snapshots. Financial obligations remain exclusively in Financial Core.';
)
  )
);
CREATE INDEX IF NOT EXISTS idx_education_bulletins_student_period
  ON education_bulletin_snapshots
  (tenant_id, organization_id, student_id, academic_year, period_code, revision DESC);
CREATE INDEX IF NOT EXISTS idx_education_bulletins_class_period
  ON education_bulletin_snapshots
  (tenant_id, organization_id, class_id, academic_year, period_code, created_at DESC);

ALTER TABLE education_bulletin_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_bulletin_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS education_bulletins_runtime_scope ON education_bulletin_snapshots;
CREATE POLICY education_bulletins_runtime_scope ON education_bulletin_snapshots
  FOR ALL TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
     AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
          AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''));
GRANT SELECT, INSERT ON education_bulletin_snapshots TO tpay_school_runtime;
GRANT UPDATE (state, voided_by, voided_at, void_reason_code) ON education_bulletin_snapshots TO tpay_school_runtime;

-- Snapshot payload and identity are immutable; only the explicit VOID transition is allowed.
CREATE OR REPLACE FUNCTION guard_education_bulletin_snapshot_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bulletin_id IS DISTINCT FROM OLD.bulletin_id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.class_id IS DISTINCT FROM OLD.class_id
    OR NEW.academic_year IS DISTINCT FROM OLD.academic_year
    OR NEW.period_code IS DISTINCT FROM OLD.period_code
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.snapshot_schema_version IS DISTINCT FROM OLD.snapshot_schema_version
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'EDUCATION_BULLETIN_SNAPSHOT_IMMUTABLE';
  END IF;
  IF OLD.state = 'VOID' OR NEW.state <> 'VOID'
    OR NEW.voided_by IS NULL OR NEW.voided_at IS NULL
    OR NEW.void_reason_code IS NULL
    OR NEW.void_reason_code !~ '^[A-Z0-9_]{3,80}
    RAISE EXCEPTION 'EDUCATION_BULLETIN_VOID_TRANSITION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_education_bulletin_snapshot_immutable ON education_bulletin_snapshots;
CREATE TRIGGER trg_education_bulletin_snapshot_immutable
BEFORE UPDATE ON education_bulletin_snapshots
FOR EACH ROW EXECUTE FUNCTION guard_education_bulletin_snapshot_update();

COMMENT ON TABLE education_bulletin_snapshots IS
  'Immutable versioned academic bulletin snapshots. Financial obligations remain exclusively in Financial Core.';
 THEN
    RAISE EXCEPTION 'EDUCATION_BULLETIN_VOID_TRANSITION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_education_bulletin_snapshot_immutable ON education_bulletin_snapshots;
CREATE TRIGGER trg_education_bulletin_snapshot_immutable
BEFORE UPDATE ON education_bulletin_snapshots
FOR EACH ROW EXECUTE FUNCTION guard_education_bulletin_snapshot_update();

COMMENT ON TABLE education_bulletin_snapshots IS
  'Immutable versioned academic bulletin snapshots. Financial obligations remain exclusively in Financial Core.';
