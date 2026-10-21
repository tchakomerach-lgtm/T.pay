-- OP-1303: repair legacy aggregate_version values created by migration 103.
-- The original migration copied the current aggregate version to each historic event.
-- Reconstruct a deterministic event-stream sequence instead. This assumes the event
-- stream contains every aggregate transition; audit legacy gaps before production use.
WITH ordered_events AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, organization_id, opportunity_id
           ORDER BY occurred_at ASC, id ASC
         ) AS reconstructed_version
  FROM opportunity_state_events
)
UPDATE opportunity_state_events e
SET aggregate_version = ordered_events.reconstructed_version
FROM ordered_events
WHERE e.id = ordered_events.id
  AND e.aggregate_version IS DISTINCT FROM ordered_events.reconstructed_version;
