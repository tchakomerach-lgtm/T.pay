CREATE TABLE IF NOT EXISTS commercial_offers (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  owner_user_id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 180),
  description text NOT NULL CHECK (length(description) BETWEEN 2 AND 5000),
  category text NOT NULL CHECK (length(category) BETWEEN 2 AND 120),
  price_minor numeric,
  currency text NOT NULL CHECK (currency = 'XOF'),
  service_area text,
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS commercial_offers_org_active_idx ON commercial_offers (organization_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS commercial_leads (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  source text NOT NULL CHECK (source IN ('tpay','whatsapp','sms','email','social','marketplace')),
  contact_ref text NOT NULL CHECK (length(contact_ref) BETWEEN 1 AND 300),
  need text NOT NULL CHECK (length(need) BETWEEN 1 AND 2000),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  consent text NOT NULL CHECK (consent IN ('unknown','granted','revoked')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS commercial_leads_org_score_idx ON commercial_leads (organization_id, score DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS commercial_campaigns (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  offer_id uuid NOT NULL REFERENCES commercial_offers(id),
  status text NOT NULL CHECK (status IN ('draft','active','paused','completed','cancelled')),
  daily_outbound_limit integer NOT NULL CHECK (daily_outbound_limit BETWEEN 0 AND 100000),
  sent_today integer NOT NULL DEFAULT 0 CHECK (sent_today >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS commercial_actions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  campaign_id uuid NOT NULL REFERENCES commercial_campaigns(id),
  lead_id uuid REFERENCES commercial_leads(id),
  action text NOT NULL CHECK (action IN ('publish_offer','discover_lead','qualify_lead','prepare_follow_up','request_quote','schedule_follow_up','pause_campaign')),
  channel text NOT NULL CHECK (channel IN ('tpay','whatsapp','sms','email','social','marketplace')),
  state text NOT NULL CHECK (state IN ('planned','approved','sent','blocked','completed','failed')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  scheduled_at timestamptz,
  executed_at timestamptz,
  failure_code text,
  created_at timestamptz NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS commercial_actions_due_idx ON commercial_actions (organization_id, state, scheduled_at);
