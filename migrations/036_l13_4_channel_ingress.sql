-- L13.4 channel ingress evidence. This is operational evidence, never financial truth.
CREATE TABLE IF NOT EXISTS api_channel_ingress_events (
  id uuid PRIMARY KEY,
  organization_id uuid,
  channel text NOT NULL CHECK (channel IN ('web','mobile','agent','ussd','sms','voice','partner')),
  scope_hash text NOT NULL CHECK (scope_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  sequence_no bigint,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('accepted','replay','conflict','quarantined')),
  correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 8 AND 200),
  received_at timestamptz NOT NULL,
  UNIQUE(channel,scope_hash,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS api_channel_ingress_sequence_unique
  ON api_channel_ingress_events(channel,scope_hash,sequence_no)
  WHERE sequence_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS api_channel_ingress_received_idx
  ON api_channel_ingress_events(received_at DESC);
