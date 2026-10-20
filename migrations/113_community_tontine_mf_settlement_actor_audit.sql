-- Attribute every settlement state change to the principal executing it.
-- Existing rows are backfilled only from recorded maker/checker identities; no actor is invented.

ALTER TABLE community_tontine_mf_settlement_instructions
  ADD COLUMN IF NOT EXISTS last_actor_id uuid;

UPDATE community_tontine_mf_settlement_instructions
SET last_actor_id = COALESCE(approved_by, prepared_by)
WHERE last_actor_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM community_tontine_mf_settlement_instructions
    WHERE last_actor_id IS NULL
  ) THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_SETTLEMENT_ACTOR_REMEDIATION_REQUIRED';
  END IF;
END;
$$;

ALTER TABLE community_tontine_mf_settlement_instructions
  ALTER COLUMN last_actor_id SET NOT NULL;

CREATE OR REPLACE FUNCTION community_tontine_mf_log_settlement_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_SETTLEMENT_DELETE_FORBIDDEN';
  END IF;

  IF NEW.last_actor_id IS NULL THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_SETTLEMENT_ACTOR_REQUIRED';
  END IF;

  INSERT INTO community_tontine_mf_settlement_audit (
    instruction_id, organization_id, tontine_group_id, microfinance_id, payout_id,
    event_type, previous_state, new_state, actor_id, row_version, amount_minor, currency
  ) VALUES (
    NEW.id, NEW.organization_id, NEW.tontine_group_id, NEW.microfinance_id, NEW.payout_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.state END,
    NEW.state, NEW.last_actor_id, NEW.version, NEW.amount_minor, NEW.currency
  );
  RETURN NEW;
END;
$$;

REVOKE UPDATE, DELETE, TRUNCATE ON community_tontine_mf_settlement_audit FROM PUBLIC;
REVOKE DELETE ON community_tontine_mf_settlement_instructions FROM PUBLIC;

COMMENT ON COLUMN community_tontine_mf_settlement_instructions.last_actor_id IS
  'Authenticated actor responsible for the latest state transition; copied to the append-only audit event by the database trigger.';
