CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_accounts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('asset','liability','equity','income','expense')),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL CHECK (status IN ('active','frozen','closed')),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL,
  UNIQUE (organization_id, code),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  idempotency_key text NOT NULL,
  occurred_at timestamptz NOT NULL,
  posted_at timestamptz NOT NULL,
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS ledger_lines (
  organization_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  line_no integer NOT NULL CHECK (line_no > 0),
  account_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('debit','credit')),
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  PRIMARY KEY (transaction_id, line_no),
  FOREIGN KEY (organization_id, transaction_id)
    REFERENCES ledger_transactions(organization_id, id),
  FOREIGN KEY (organization_id, account_id)
    REFERENCES financial_accounts(organization_id, id)
);

CREATE TABLE IF NOT EXISTS tontine_contributions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('scheduled','pending','confirmed','missed','reversed')),
  scheduled_for timestamptz NOT NULL,
  collected_at timestamptz,
  payment_intent_id uuid,
  provider_reference text,
  updated_at timestamptz NOT NULL,
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS tontine_payment_intents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  contribution_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  provider text NOT NULL,
  provider_reference text,
  status text NOT NULL CHECK (status IN ('initiated','pending','provider_confirmed','settled','failed','reversed')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, contribution_id)
    REFERENCES tontine_contributions(organization_id, id)
);

CREATE TABLE IF NOT EXISTS provider_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  received_at timestamptz NOT NULL,
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE IF NOT EXISTS tontine_fee_snapshots (
  contribution_id uuid PRIMARY KEY REFERENCES tontine_contributions(id),
  microfinance_fee_minor numeric(38,0) NOT NULL CHECK (microfinance_fee_minor >= 0),
  tpay_fee_minor numeric(38,0) NOT NULL CHECK (tpay_fee_minor >= 0),
  total_fee_minor numeric(38,0) NOT NULL CHECK (total_fee_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  rule_version text NOT NULL,
  calculated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS tontine_receipts (
  receipt_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  contribution_id uuid NOT NULL,
  payment_intent_id uuid NOT NULL,
  provider_reference text NOT NULL,
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  issued_at timestamptz NOT NULL,
  ledger_transaction_id uuid NOT NULL,
  UNIQUE (organization_id, contribution_id),
  UNIQUE (organization_id, payment_intent_id),
  FOREIGN KEY (organization_id, contribution_id)
    REFERENCES tontine_contributions(organization_id, id),
  FOREIGN KEY (organization_id, payment_intent_id)
    REFERENCES tontine_payment_intents(organization_id, id),
  FOREIGN KEY (organization_id, ledger_transaction_id)
    REFERENCES ledger_transactions(organization_id, id)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  event_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_org_posted
  ON ledger_transactions (organization_id, posted_at);

CREATE INDEX IF NOT EXISTS idx_provider_events_org_received
  ON provider_events (organization_id, received_at);

CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
  ON outbox_events (occurred_at)
  WHERE published_at IS NULL;
