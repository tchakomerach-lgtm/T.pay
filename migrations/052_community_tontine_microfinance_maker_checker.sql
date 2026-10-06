-- Hardening for independent Community Tontine microfinance access.
-- Settlement preparation and approval are intentionally separate capabilities.

ALTER TABLE community_tontine_mf_access
  DROP CONSTRAINT IF EXISTS community_tontine_mf_access_role_check;

ALTER TABLE community_tontine_mf_access
  ADD CONSTRAINT community_tontine_mf_access_role_check
  CHECK (role IN (
    'portfolio_manager','kyc_officer','collection_supervisor',
    'settlement_officer','settlement_supervisor','reconciliation_officer',
    'risk_officer','branch_manager'
  ));

COMMENT ON TABLE community_tontine_mf_access IS
  'Operational access for a partner microfinance to manage the financial service side of an independent Community Tontine. Governance and Financial Core Ledger authority remain outside this scope.';
