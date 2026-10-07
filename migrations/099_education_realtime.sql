CREATE SEQUENCE IF NOT EXISTS education_realtime_stream_sequence;

CREATE TABLE IF NOT EXISTS education_realtime_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  stream_sequence bigint NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  entity_id text NOT NULL,
  version bigint NOT NULL,
  data jsonb NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, organization_id, id),
  UNIQUE (tenant_id, organization_id, stream_sequence)
);

CREATE INDEX IF NOT EXISTS idx_education_realtime_events_stream
  ON education_realtime_events (tenant_id, organization_id, stream_sequence);

CREATE INDEX IF NOT EXISTS idx_education_realtime_events_created
  ON education_realtime_events (tenant_id, organization_id, created_at);

ALTER TABLE education_realtime_events
  ADD CONSTRAINT education_realtime_event_sequence_positive CHECK (stream_sequence > 0),
  ADD CONSTRAINT education_realtime_event_version_nonnegative CHECK (version >= 0);
