CREATE TABLE IF NOT EXISTS opportunities (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  owner_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  state text NOT NULL DEFAULT 'DRAFT',
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  risk_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CHECK (state IN ('DRAFT','PUBLISHED','MATCHING','APPLICATIONS_OPEN','REVIEW','NEGOTIATION','CONTRACTED','IN_PROGRESS','DELIVERABLE_REVIEW','ACCEPTED','COMPLETED','PAUSED','DISPUTED','RECOVERY','CANCELLED','EXPIRED'))
);

CREATE INDEX IF NOT EXISTS idx_opportunities_scope_state
  ON opportunities (tenant_id, organization_id, state, updated_at DESC);

CREATE TABLE IF NOT EXISTS opportunity_state_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  opportunity_id text NOT NULL REFERENCES opportunities(id),
  from_state text NOT NULL,
  to_state text NOT NULL,
  command text NOT NULL,
  actor_id text NOT NULL,
  actor_class text NOT NULL,
  requires_human_approval boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  event_hash text NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunity_state_event_idempotency
  ON opportunity_state_events (tenant_id, organization_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_opportunity_state_events_stream
  ON opportunity_state_events (tenant_id, organization_id, opportunity_id, occurred_at, id);

CREATE TABLE IF NOT EXISTS opportunity_event_outbox (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);

CREATE INDEX IF NOT EXISTS idx_opportunity_outbox_dispatch
  ON opportunity_event_outbox (available_at, occurred_at)
  WHERE published_at IS NULL;

COMMENT ON TABLE opportunities IS 'OP-1296 Opportunity aggregate root with optimistic versioning.';
COMMENT ON TABLE opportunity_state_events IS 'OP-1297 immutable lifecycle transition ledger.';
COMMENT ON TABLE opportunity_event_outbox IS 'OP-1298 transactional outbox for realtime Opportunity events.';
