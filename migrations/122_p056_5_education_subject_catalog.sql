-- P056.5 — organization-scoped academic subject catalog.
-- Education owns academic reference data only; no fee, payment, wallet or ledger state.
CREATE TABLE IF NOT EXISTS education_subjects (
  subject_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  subject_code text NOT NULL CHECK (subject_code ~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR length(description) <= 1000),
  coefficient numeric(5,2) NOT NULL DEFAULT 1 CHECK (coefficient > 0 AND coefficient <= 100),
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, organization_id, subject_id),
  UNIQUE (tenant_id, organization_id, subject_code),
  CONSTRAINT education_subjects_creator_scope_fk
    FOREIGN KEY (tenant_id, organization_id, created_by)
    REFERENCES education_actors (tenant_id, organization_id, actor_id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_education_subjects_scope_active
  ON education_subjects (tenant_id, organization_id, active, subject_code);
ALTER TABLE education_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_subjects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS education_subjects_runtime_scope ON education_subjects;
CREATE POLICY education_subjects_runtime_scope ON education_subjects
  FOR ALL TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
     AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
          AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''));
GRANT SELECT, INSERT, UPDATE ON education_subjects TO tpay_school_runtime;
COMMENT ON TABLE education_subjects IS
  'Organization-scoped subject master data. Subject retirement is versioned; historical assessments retain their subject code.';
