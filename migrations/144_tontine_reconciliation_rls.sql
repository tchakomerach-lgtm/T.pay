-- P057.4.1 — PostgreSQL tenant isolation for reconciliation findings.
-- Migration 129 has already installed the canonical organization context function.
-- Missing context resolves to NULL and therefore denies every row.
ALTER TABLE tontine_reconciliation_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tontine_reconciliation_findings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON tontine_reconciliation_findings FROM PUBLIC;
DROP POLICY IF EXISTS tontine_reconciliation_findings_org_scope ON tontine_reconciliation_findings;
CREATE POLICY tontine_reconciliation_findings_org_scope
  ON tontine_reconciliation_findings
  FOR ALL
  USING (organization_id = public.tpay_current_organization_id())
  WITH CHECK (organization_id = public.tpay_current_organization_id());
COMMENT ON POLICY tontine_reconciliation_findings_org_scope
  ON tontine_reconciliation_findings IS
  'Fail-closed organization isolation using the canonical T.Pay organization context. Application predicates remain defense in depth.';
