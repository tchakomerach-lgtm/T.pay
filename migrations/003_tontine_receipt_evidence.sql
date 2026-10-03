ALTER TABLE tontine_receipts
  ADD COLUMN IF NOT EXISTS evidence_schema_version integer,
  ADD COLUMN IF NOT EXISTS evidence_digest char(64),
  ADD COLUMN IF NOT EXISTS evidence_mac char(64);

ALTER TABLE tontine_receipts
  DROP CONSTRAINT IF EXISTS tontine_receipts_evidence_consistency_check;

ALTER TABLE tontine_receipts
  ADD CONSTRAINT tontine_receipts_evidence_consistency_check
  CHECK (
    (evidence_schema_version IS NULL AND evidence_digest IS NULL AND evidence_mac IS NULL)
    OR
    (evidence_schema_version = 1
      AND evidence_digest ~ '^[0-9a-f]{64}$'
      AND evidence_mac ~ '^[0-9a-f]{64}$')
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_receipts_org_evidence_digest
  ON tontine_receipts (organization_id, evidence_digest)
  WHERE evidence_digest IS NOT NULL;
