CREATE TABLE IF NOT EXISTS community_tontine_mf_access (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  tontine_group_id uuid NOT NULL REFERENCES tontine_groups(id),
  microfinance_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('portfolio_manager','kyc_officer','collection_supervisor','settlement_officer','reconciliation_officer','risk_officer','branch_manager')),
  status text NOT NULL CHECK (status IN ('invited','active','suspended','revoked')),
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_community_tontine_mf_access
  ON community_tontine_mf_access (organization_id,tontine_group_id,microfinance_id,role)
  WHERE status IN ('invited','active');

CREATE TABLE IF NOT EXISTS community_tontine_mf_reconciliation (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  tontine_group_id uuid NOT NULL REFERENCES tontine_groups(id),
  microfinance_id uuid NOT NULL,
  external_reference text NOT NULL,
  expected_minor numeric(38,0) NOT NULL CHECK (expected_minor >= 0),
  observed_minor numeric(38,0) NOT NULL CHECK (observed_minor >= 0),
  currency char(3) NOT NULL,
  state text NOT NULL CHECK (state IN ('open','investigating','resolved','escalated')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_community_tontine_mf_recon
  ON community_tontine_mf_reconciliation (organization_id,microfinance_id,tontine_group_id,state);

COMMENT ON TABLE community_tontine_mf_access IS
  'Operational access for a partner microfinance to manage its financial side of an independent Community Tontine. Does not transfer community governance or ledger authority.';
COMMENT ON TABLE community_tontine_mf_reconciliation IS
  'Partner-side reconciliation exceptions. Financial Core remains authoritative for posted ledger state.';
