CREATE TABLE IF NOT EXISTS provider_contracts (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  provider_id text NOT NULL CHECK (length(provider_id) BETWEEN 2 AND 64),
  contract_id text NOT NULL CHECK (length(contract_id) BETWEEN 1 AND 160),
  contract_version text NOT NULL CHECK (length(contract_version) BETWEEN 1 AND 80),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  source_kind text NOT NULL CHECK (source_kind IN ('operator_signed','authorized_aggregator_signed')),
  activation_state text NOT NULL CHECK (activation_state IN ('DISCOVERY','CONTRACT_PENDING','CONTRACT_REGISTERED','SANDBOX_VALIDATED','PILOT','PRODUCTION')),
  callback_signature_scheme text NOT NULL CHECK (callback_signature_scheme IN ('hmac_sha256','asymmetric','contract_defined')),
  callback_schema_version text NOT NULL CHECK (length(callback_schema_version) BETWEEN 1 AND 80),
  allowed_currencies text[] NOT NULL,
  max_clock_skew_seconds integer NOT NULL CHECK (max_clock_skew_seconds BETWEEN 1 AND 3600),
  effective_at timestamptz NOT NULL,
  expires_at timestamptz,
  evidence_ref text NOT NULL CHECK (length(evidence_ref) BETWEEN 1 AND 500),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id, provider_id),
  CHECK (expires_at IS NULL OR expires_at > effective_at)
);
CREATE INDEX IF NOT EXISTS provider_contracts_activation_idx ON provider_contracts (activation_state, provider_id);
