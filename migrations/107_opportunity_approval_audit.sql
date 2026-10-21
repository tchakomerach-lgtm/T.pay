-- OP-1305: immutable evidence for approval decisions and atomic consumption.
CREATE TABLE IF NOT EXISTS opportunity_approval_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  approval_id text NOT NULL REFERENCES opportunity_approvals(id),
  action text NOT NULL CHECK (action IN ('APPROVED','CONSUMED')),
  actor_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_hash text NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_opportunity_approval_events_stream
  ON opportunity_approval_events (tenant_id, organization_id, approval_id, occurred_at, id);

CREATE OR REPLACE FUNCTION reject_opportunity_approval_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'OPPORTUNITY_APPROVAL_EVENT_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS opportunity_approval_events_no_update ON opportunity_approval_events;
CREATE TRIGGER opportunity_approval_events_no_update
  BEFORE UPDATE OR DELETE ON opportunity_approval_events
  FOR EACH ROW EXECUTE FUNCTION reject_opportunity_approval_event_mutation();

COMMENT ON TABLE opportunity_approval_events IS
  'OP-1305 append-only audit stream for human approval decisions and consumption.';
