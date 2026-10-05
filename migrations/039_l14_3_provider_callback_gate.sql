CREATE TABLE IF NOT EXISTS provider_callback_claims (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL CHECK (length(provider) BETWEEN 2 AND 64),
  event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 200),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  first_received_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id, provider, event_id)
);
CREATE INDEX IF NOT EXISTS provider_callback_claims_received_idx ON provider_callback_claims (organization_id, first_received_at DESC);
ALTER TABLE provider_events DROP CONSTRAINT IF EXISTS provider_events_pkey;
ALTER TABLE provider_events ADD CONSTRAINT provider_events_pkey PRIMARY KEY (organization_id, provider, event_id);
CREATE INDEX IF NOT EXISTS idx_provider_events_lookup ON provider_events (organization_id, provider, event_id);