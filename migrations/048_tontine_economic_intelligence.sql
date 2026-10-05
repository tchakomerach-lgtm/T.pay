CREATE TABLE IF NOT EXISTS tontine_community_demands (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  tontine_group_id uuid NOT NULL REFERENCES tontine_groups(id),
  created_by uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('draft','open','aggregating','quoted','ordered','fulfilled','cancelled')),
  currency char(3) NOT NULL,
  deadline timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tontine_supplier_bids (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  demand_id uuid NOT NULL REFERENCES tontine_community_demands(id),
  supplier_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('submitted','shortlisted','accepted','rejected','withdrawn')),
  total_minor numeric(38,0) NOT NULL CHECK (total_minor > 0),
  currency char(3) NOT NULL,
  valid_until timestamptz NOT NULL,
  quality_terms text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tontine_supplier_bids_demand
  ON tontine_supplier_bids (organization_id, demand_id, state, total_minor);

CREATE TABLE IF NOT EXISTS tontine_purchase_orders (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  demand_id uuid NOT NULL REFERENCES tontine_community_demands(id),
  supplier_id uuid NOT NULL,
  approved_by uuid NOT NULL,
  total_minor numeric(38,0) NOT NULL CHECK (total_minor > 0),
  currency char(3) NOT NULL,
  state text NOT NULL CHECK (state IN ('approved','in_fulfillment','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tontine_delivery_milestones (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL REFERENCES tontine_purchase_orders(id),
  state text NOT NULL CHECK (state IN ('planned','partial','delivered','quality_hold','disputed','returned')),
  quantity_delivered numeric(38,0) NOT NULL CHECK (quantity_delivered >= 0),
  proof_hash text,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tontine_intelligence_predictions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES tontine_groups(id),
  horizon text NOT NULL CHECK (horizon IN ('H0','H1','H2')),
  target text NOT NULL,
  probability numeric(8,7) NOT NULL CHECK (probability >= 0 AND probability <= 1),
  confidence numeric(8,7) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_refs_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tontine_intelligence_group
  ON tontine_intelligence_predictions (organization_id, group_id, created_at DESC);

COMMENT ON TABLE tontine_intelligence_predictions IS
  'Analytical predictions only. They cannot mutate contributions, payouts or ledger state.';
