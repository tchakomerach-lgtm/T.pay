-- Tenant-bound integrity for Community Tontine case management.
-- Case/evidence/hold/refund records are operational controls only; money remains in Financial Core.

CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_cases_org_id
  ON tontine_cases (organization_id,id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_cases_org_group_fk' AND conrelid='tontine_cases'::regclass) THEN
    ALTER TABLE tontine_cases ADD CONSTRAINT tontine_cases_org_group_fk
      FOREIGN KEY (organization_id,group_id)
      REFERENCES tontine_groups(organization_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_case_evidence_org_case_fk' AND conrelid='tontine_case_evidence'::regclass) THEN
    ALTER TABLE tontine_case_evidence ADD CONSTRAINT tontine_case_evidence_org_case_fk
      FOREIGN KEY (organization_id,case_id)
      REFERENCES tontine_cases(organization_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_holds_org_case_fk' AND conrelid='tontine_targeted_holds'::regclass) THEN
    ALTER TABLE tontine_targeted_holds ADD CONSTRAINT tontine_holds_org_case_fk
      FOREIGN KEY (organization_id,case_id)
      REFERENCES tontine_cases(organization_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_refunds_org_case_fk' AND conrelid='tontine_refund_requests'::regclass) THEN
    ALTER TABLE tontine_refund_requests ADD CONSTRAINT tontine_refunds_org_case_fk
      FOREIGN KEY (organization_id,case_id)
      REFERENCES tontine_cases(organization_id,id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_tontine_case_evidence_case_time
  ON tontine_case_evidence (organization_id,case_id,captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_tontine_holds_active_scope
  ON tontine_targeted_holds (organization_id,scope,reference)
  WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tontine_refunds_case_state
  ON tontine_refund_requests (organization_id,case_id,state);

CREATE OR REPLACE FUNCTION reject_tontine_case_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'TONTINE_CASE_EVIDENCE_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS trg_tontine_case_evidence_no_update ON tontine_case_evidence;
CREATE TRIGGER trg_tontine_case_evidence_no_update
BEFORE UPDATE OR DELETE ON tontine_case_evidence
FOR EACH ROW EXECUTE FUNCTION reject_tontine_case_evidence_mutation();

COMMENT ON CONSTRAINT tontine_cases_org_group_fk ON tontine_cases IS
  'Prevents a tontine case from referencing a group owned by another organization.';
COMMENT ON FUNCTION reject_tontine_case_evidence_mutation() IS
  'Evidence is append-only; corrections require a new evidence record.';
