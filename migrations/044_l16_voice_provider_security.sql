-- L16.2 — durable voice-provider callback replay barrier and adapter endpoint policy.
-- Raw provider secrets are never stored here.
CREATE TABLE IF NOT EXISTS voice_provider_callback_claims (
  organization_id text NOT NULL,
  provider_id text NOT NULL,
  event_id text NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  first_received_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id, provider_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_voice_provider_callback_claims_time
  ON voice_provider_callback_claims (organization_id, first_received_at DESC);

CREATE TABLE IF NOT EXISTS voice_provider_endpoints (
  organization_id text NOT NULL,
  provider_id text NOT NULL,
  endpoint text NOT NULL,
  protocol text NOT NULL CHECK (protocol IN ('https','http3','sip-tls','webrtc-dtls-srtp')),
  require_mtls boolean NOT NULL DEFAULT false,
  tls_minimum text NOT NULL DEFAULT 'TLSv1.3' CHECK (tls_minimum = 'TLSv1.3'),
  allowed_host text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  contract_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, provider_id),
  CHECK (endpoint ~ '^https://'),
  CHECK (allowed_host <> ''),
  CHECK (contract_version <> '')
);

COMMENT ON TABLE voice_provider_callback_claims IS
  'Durable anti-replay barrier. Same provider event may be observed repeatedly, but only one claim can win.';
COMMENT ON TABLE voice_provider_endpoints IS
  'Provider-neutral endpoint policy. Secrets/certificates live in KMS/HSM/secret manager, never in PostgreSQL.';
