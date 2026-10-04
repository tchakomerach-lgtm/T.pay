CREATE TABLE IF NOT EXISTS mfi_collection_intents (
  collection_id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  partner_mfi_id text NOT NULL, client_id text NOT NULL, agent_id text NOT NULL,
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (length(currency) = 3),
  channel text NOT NULL CHECK (channel IN ('cash_agent','tmoney','flooz','pi_spi','partner_mfi')),
  location text NOT NULL CHECK (location IN ('home','work','other')),
  latitude numeric(9,6), longitude numeric(9,6), occurred_at timestamptz NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','accepted','rejected','quarantined')),
  provider_reference text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (organization_id,collection_id),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_mfi_collection_org_client ON mfi_collection_intents(organization_id,client_id,occurred_at);
CREATE TABLE IF NOT EXISTS mfi_cash_sessions (
  session_id text PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
  partner_mfi_id text NOT NULL, agent_id text NOT NULL, currency text NOT NULL CHECK (length(currency)=3),
  opened_at timestamptz NOT NULL, closed_at timestamptz, opening_float_minor numeric(38,0) NOT NULL CHECK (opening_float_minor>=0),
  counted_close_minor numeric(38,0), expected_close_minor numeric(38,0), variance_minor numeric(38,0),
  status text NOT NULL CHECK (status IN ('open','pending_reconciliation','reconciled','exception')),
  UNIQUE (organization_id,session_id)
);
CREATE TABLE IF NOT EXISTS mfi_cash_movements (
  movement_id text PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
  session_id text NOT NULL, collection_id text,
  FOREIGN KEY (organization_id,session_id) REFERENCES mfi_cash_sessions(organization_id,session_id),
  FOREIGN KEY (organization_id,collection_id) REFERENCES mfi_collection_intents(organization_id,collection_id),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor>0), currency text NOT NULL CHECK (length(currency)=3),
  evidence_ref text, occurred_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mfi_cash_movements_session ON mfi_cash_movements(session_id,occurred_at);
CREATE TABLE IF NOT EXISTS mfi_reconciliation_exceptions (
  exception_id text PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
  session_id text NOT NULL,
  FOREIGN KEY (organization_id,session_id) REFERENCES mfi_cash_sessions(organization_id,session_id),
  classification text NOT NULL CHECK (classification IN ('shortage','overage','currency_mismatch','missing_evidence','duplicate_collection')),
  amount_minor numeric(38,0), currency text NOT NULL CHECK (length(currency)=3),
  status text NOT NULL CHECK (status IN ('open','investigating','resolved','waived')),
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfi_recon_exceptions_open ON mfi_reconciliation_exceptions(organization_id,status,created_at);
