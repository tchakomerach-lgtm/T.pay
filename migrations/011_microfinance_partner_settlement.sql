CREATE TABLE IF NOT EXISTS mfi_partner_settlements (
  settlement_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  partner_mfi_id text NOT NULL,
  provider text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('collection','disbursement','refund')),
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL,
  client_reference text NOT NULL,
  provider_reference text,
  idempotency_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','submitted','provider_confirmed','settled','quarantined','failed','reversed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  UNIQUE (organization_id,settlement_id),
  UNIQUE (organization_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS mfi_provider_callbacks (
  callback_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  settlement_id uuid,
  raw_body_hash text NOT NULL,
  received_at timestamptz NOT NULL,
  provider_occurred_at timestamptz,
  freshness_ok boolean NOT NULL,
  signature_ok boolean NOT NULL,
  payload_valid boolean NOT NULL,
  state text NOT NULL CHECK (state IN ('accepted','duplicate','rejected','quarantined')),
  UNIQUE (organization_id,callback_id),
  UNIQUE (organization_id,provider,provider_event_id),
  FOREIGN KEY (organization_id,settlement_id) REFERENCES mfi_partner_settlements(organization_id,settlement_id)
);

CREATE TABLE IF NOT EXISTS mfi_settlement_reconciliations (
  reconciliation_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  settlement_id uuid NOT NULL,
  internal_amount_minor numeric(38,0) NOT NULL CHECK (internal_amount_minor > 0),
  provider_amount_minor numeric(38,0) NOT NULL CHECK (provider_amount_minor > 0),
  internal_currency text NOT NULL,
  provider_currency text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('matched','amount_mismatch','currency_mismatch','reference_mismatch','state_mismatch')),
  status text NOT NULL CHECK (status IN ('open','resolved','waived')),
  evidence_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,settlement_id) REFERENCES mfi_partner_settlements(organization_id,settlement_id),
  UNIQUE (organization_id,reconciliation_id)
);
CREATE INDEX IF NOT EXISTS idx_mfi_provider_callbacks_settlement ON mfi_provider_callbacks(organization_id,settlement_id);
CREATE INDEX IF NOT EXISTS idx_mfi_settlement_reconciliation_status ON mfi_settlement_reconciliations(organization_id,status);
