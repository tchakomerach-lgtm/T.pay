-- P057.4.1 — PostgreSQL tenant isolation for reconciliation findings.
-- Reuse the canonical organization context established by the Fortress/Identity layer.
-- Missing context resolves to NULL and therefore denies every row (fail closed).

ALTER TABLE tontine_reconciliation_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tontine_reconciliation_findings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON tontine_reconciliation_findings FROM PUBLIC;

DROP POLICY IF EXISTS tontine_reconciliation_findings_org_scope
  ON tontine_reconciliation_findings;

CREATE POLICY tontine_reconciliation_findings_org_scope
  ON tontine_reconciliation_findings
  FOR ALL
  USING (organization_id = tpay_current_organization_id())
  WITH CHECK (organization_id = tpay_current_organization_id());

COMMENT ON POLICY tontine_reconciliation_findings_org_scope
  ON tontine_reconciliation_findings IS
  'Fail-closed organization isolation using the canonical T.Pay organization context. Application predicates remain defense in depth.';
