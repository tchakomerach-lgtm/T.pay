-- Tighten maker/checker invariants after migration 109; preserve previously deployed migration checksums.
-- Existing null preparers are not silently attributed to an invented actor.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM community_tontine_mf_settlement_instructions
    WHERE prepared_by IS NULL
  ) THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_SETTLEMENT_PREPARER_REMEDIATION_REQUIRED';
  END IF;
END;
$$;

ALTER TABLE community_tontine_mf_settlement_instructions
  ALTER COLUMN prepared_by SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_tontine_mf_settlement_checker_state_check'
      AND conrelid = 'community_tontine_mf_settlement_instructions'::regclass
  ) THEN
    ALTER TABLE community_tontine_mf_settlement_instructions
      ADD CONSTRAINT community_tontine_mf_settlement_checker_state_check
      CHECK (
        state NOT IN ('approved','submitted','provider_pending','settled')
        OR (approved_by IS NOT NULL AND approved_by <> prepared_by)
      );
  END IF;
END;
$$;

COMMENT ON COLUMN community_tontine_mf_settlement_instructions.prepared_by IS
  'Authenticated human principal who prepared the instruction; never inferred from the grantor or service account.';
