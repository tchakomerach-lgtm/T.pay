-- Durable maker/checker workflow for the partner microfinance operational layer.
-- This table is a workflow/read-model boundary only: it never becomes Ledger authority.

CREATE TABLE IF NOT EXISTS community_tontine_mf_settlement_instructions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  tontine_group_id uuid NOT NULL REFERENCES tontine_groups(id),
  microfinance_id uuid NOT NULL,
  payout_id uuid NOT NULL,
  beneficiary_client_id uuid NOT NULL,
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  destination_ref text NOT NULL,
  requires_human_approval boolean NOT NULL DEFAULT true,
  prepared_by uuid,
  approved_by uuid,
  state text NOT NULL CHECK (state IN ('prepared','approved','submitted','provider_pending','settled','exception')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now(),
  CHECK (approved_by IS NULL OR prepared_by IS NULL OR approved_by <> prepared_by)
);

CREATE INDEX IF NOT EXISTS idx_community_tontine_mf_settlement_scope
  ON community_tontine_mf_settlement_instructions
  (organization_id,microfinance_id,tontine_group_id,state);

CREATE UNIQUE INDEX IF NOT EXISTS uq_community_tontine_mf_settlement_payout
  ON community_tontine_mf_settlement_instructions (organization_id,microfinance_id,payout_id);

COMMENT ON TABLE community_tontine_mf_settlement_instructions IS
  'Durable partner-microfinance settlement workflow for an independent Community Tontine. Financial Core remains the sole authority for posted financial state.';
