-- OP-1301: preserve the exact aggregate version attached to each lifecycle event.
-- Historical event versions are reconstructed in deterministic stream order.
-- Do not copy the current aggregate version onto every historical event.
ALTER TABLE opportunity_state_events
  ADD COLUMN IF NOT EXISTS aggregate_version bigint;

WITH ordered_events AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, organization_id, opportunity_id
           ORDER BY occurred_at ASC, id ASC
         ) AS reconstructed_version
  FROM opportunity_state_events
  WHERE aggregate_version IS NULL
)
UPDATE opportunity_state_events e
SET aggregate_version = ordered_events.reconstructed_version
FROM ordered_events
WHERE e.id = ordered_events.id
  AND e.aggregate_version IS NULL;

ALTER TABLE opportunity_state_events
  ALTER COLUMN aggregate_version SET NOT NULL;

ALTER TABLE opportunity_state_events
  ADD CONSTRAINT opportunity_state_events_aggregate_version_positive
  CHECK (aggregate_version > 0);
