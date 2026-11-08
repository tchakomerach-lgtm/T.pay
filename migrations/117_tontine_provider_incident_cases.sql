-- P057.3: idempotent system-originated incident cases for provider callbacks.
-- System incidents are explicitly distinguished from human-opened cases.
ALTER TABLE tontine_cases
  ADD COLUMN IF NOT EXISTS source_event_key text,
  ADD COLUMN IF NOT EXISTS opened_by_system boolean NOT NULL DEFAULT false;

ALTER TABLE tontine_cases
  ALTER COLUMN opened_by DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='tontine_cases_opened_by_actor_check'
      AND conrelid='tontine_cases'::regclass
  ) THEN
    ALTER TABLE tontine_cases
      ADD CONSTRAINT tontine_cases_opened_by_actor_check
      CHECK (
        (opened_by IS NOT NULL AND opened_by_system = false)
        OR (opened_by IS NULL AND opened_by_system = true)
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_cases_source_event
  ON tontine_cases (organization_id, source_event_key)
  WHERE source_event_key IS NOT NULL;

COMMENT ON COLUMN tontine_cases.source_event_key IS
  'Stable provider-event identity used to deduplicate automatically opened incidents.';
COMMENT ON COLUMN tontine_cases.opened_by_system IS
  'True only for system-created cases; human actor identity is never fabricated.';
