-- Close organization-scope gaps in Community Tontine case workflows.
-- Fails closed if existing case/evidence/hold/refund rows cross group boundaries.

CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_cases_org_id
  ON tontine_cases (organization_id,id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_cases_org_group_fk' AND conrelid='tontine_cases'::regclass) THEN
    ALTER TABLE tontine_cases
      ADD CONSTRAINT tontine_cases_org_group_fk
      FOREIGN KEY (organization_id,group_id)
      REFERENCES tontine_groups(organization_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_case_evidence_org_case_fk' AND conrelid='tontine_case_evidence'::regclass) THEN
    ALTER TABLE tontine_case_evidence
      ADD CONSTRAINT tontine_case_evidence_org_case_fk
      FOREIGN KEY (organization_id,case_id)
      REFERENCES tontine_cases(organization_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_holds_org_case_fk' AND conrelid='tontine_targeted_holds'::regclass) THEN
    ALTER TABLE tontine_targeted_holds
      ADD CONSTRAINT tontine_holds_org_case_fk
      FOREIGN KEY (organization_id,case_id)
      REFERENCES tontine_cases(organization_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_refunds_org_case_fk' AND conrelid='tontine_refund_requests'::regclass) THEN
    ALTER TABLE tontine_refund_requests
      ADD CONSTRAINT tontine_refunds_org_case_fk
      FOREIGN KEY (organization_id,case_id)
      REFERENCES tontine_cases(organization_id,id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_tontine_case_evidence_org_case_time
  ON tontine_case_evidence (organization_id,case_id,captured_at DESC,id);

ALTER TABLE tontine_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE tontine_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE tontine_case_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE tontine_case_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE tontine_targeted_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE tontine_targeted_holds FORCE ROW LEVEL SECURITY;
ALTER TABLE tontine_refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tontine_refund_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tontine_cases_organization_scope ON tontine_cases;
CREATE POLICY tontine_cases_organization_scope ON tontine_cases
  FOR ALL
  USING (organization_id = NULLIF(current_setting('tpay.organization_id',true),'')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('tpay.organization_id',true),'')::uuid);

DROP POLICY IF EXISTS tontine_case_evidence_organization_scope ON tontine_case_evidence;
CREATE POLICY tontine_case_evidence_organization_scope ON tontine_case_evidence
  FOR ALL
  USING (organization_id = NULLIF(current_setting('tpay.organization_id',true),'')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('tpay.organization_id',true),'')::uuid);

DROP POLICY IF EXISTS tontine_targeted_holds_organization_scope ON tontine_targeted_holds;
CREATE POLICY tontine_targeted_holds_organization_scope ON tontine_targeted_holds
  FOR ALL
  USING (organization_id = NULLIF(current_setting('tpay.organization_id',true),'')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('tpay.organization_id',true),'')::uuid);

DROP POLICY IF EXISTS tontine_refund_requests_organization_scope ON tontine_refund_requests;
CREATE POLICY tontine_refund_requests_organization_scope ON tontine_refund_requests
  FOR ALL
  USING (organization_id = NULLIF(current_setting('tpay.organization_id',true),'')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('tpay.organization_id',true),'')::uuid);

COMMENT ON TABLE tontine_case_evidence IS
  'Organization-scoped evidence metadata. Binary objects remain in the dedicated encrypted object-storage service.';
COMMENT ON TABLE tontine_targeted_holds IS
  'Organization-scoped case holds; these records do not directly mutate Financial Core balances.';
COMMENT ON TABLE tontine_refund_requests IS
  'Organization-scoped refund workflow; settlement remains exclusively in Financial Core.';
