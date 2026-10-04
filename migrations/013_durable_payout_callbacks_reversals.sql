CREATE TABLE IF NOT EXISTS payout_provider_events (
  event_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  payout_id uuid NOT NULL REFERENCES payout_intents(payout_id),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  raw_body_hash text NOT NULL,
  signature_ok boolean NOT NULL,
  freshness_ok boolean NOT NULL,
  payload_valid boolean NOT NULL,
  amount_minor numeric(38,0),
  currency text,
  provider_reference text,
  state text NOT NULL CHECK (state IN ('accepted','duplicate','rejected','quarantined')),
  received_at timestamptz NOT NULL,
  occurred_at timestamptz,
  UNIQUE (organization_id, provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS payout_exceptions (
  exception_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  payout_id uuid REFERENCES payout_intents(payout_id),
  provider text,
  provider_event_id text,
  classification text NOT NULL CHECK (classification IN (
    'provider_only','internal_only','amount_mismatch','currency_mismatch',
    'identity_mismatch','status_mismatch','signature_invalid','stale_event',
    'duplicate_event','reversal_failed','concurrency_conflict'
  )),
  amount_minor numeric(38,0),
  currency text,
  reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('open','investigating','resolved','waived')),
  created_at timestamptz NOT NULL,
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS payout_reversals (
  reversal_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  payout_id uuid NOT NULL REFERENCES payout_intents(payout_id),
  provider text NOT NULL,
  original_provider_reference text NOT NULL,
  reversal_provider_reference text,
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (length(currency) = 3),
  reason text NOT NULL,
  state text NOT NULL CHECK (state IN ('requested','provider_pending','provider_confirmed','financially_settled','failed','quarantined')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payout_provider_events_org_payout
  ON payout_provider_events(organization_id,payout_id,received_at);
CREATE INDEX IF NOT EXISTS idx_payout_exceptions_org_status
  ON payout_exceptions(organization_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_payout_reversals_org_payout
  ON payout_reversals(organization_id,payout_id,created_at);
