CREATE TABLE IF NOT EXISTS mfi_provider_callbacks (
 callback_id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), provider text NOT NULL,
 provider_event_id text NOT NULL, raw_body_hash text NOT NULL, signature_ok boolean NOT NULL, freshness_ok boolean NOT NULL,
 payload_valid boolean NOT NULL, state text NOT NULL CHECK(state IN ('accepted','duplicate','rejected','quarantined')),
 provider_reference text, received_at timestamptz NOT NULL, occurred_at timestamptz,
 UNIQUE(organization_id,provider,provider_event_id)
);
CREATE INDEX IF NOT EXISTS idx_mfi_provider_callbacks_state ON mfi_provider_callbacks(organization_id,state,received_at);
