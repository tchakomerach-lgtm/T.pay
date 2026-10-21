-- OP-1301: preserve the exact aggregate version attached to each idempotent command.
ALTER TABLE opportunity_state_events
  ADD COLUMN IF NOT EXISTS aggregate_version bigint;

UPDATE opportunity_state_events e
SET aggregate_version = o.version
FROM opportunities o
WHERE e.opportunity_id = o.id
  AND e.tenant_id = o.tenant_id
  AND e.organization_id = o.organization_id
  AND e.aggregate_version IS NULL;

ALTER TABLE opportunity_state_events
  ALTER COLUMN aggregate_version SET NOT NULL;

ALTER TABLE opportunity_state_events
  ADD CONSTRAINT opportunity_state_events_aggregate_version_positive
  CHECK (aggregate_version > 0);
