-- OP-1304: durable approval evidence with separation-of-duties and one-time consumption.
CREATE TABLE IF NOT EXISTS opportunity_approvals (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  opportunity_id text NOT NULL REFERENCES opportunities(id),
  command text NOT NULL,
  requester_id text NOT NULL,
  approver_id text NOT NULL,
  status text NOT NULL DEFAULT 'APPROVED',
  reason text NOT NULL,
  evidence_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (requester_id <> approver_id),
  CHECK (expires_at > created_at),
  CHECK (status IN ('APPROVED','CONSUMED','REVOKED','REJECTED','EXPIRED')),
  CHECK ((status = 'CONSUMED') = (consumed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_opportunity_approvals_scope
  ON opportunity_approvals
    (tenant_id, organization_id, opportunity_id, command, status, expires_at);

COMMENT ON TABLE opportunity_approvals IS
  'OP-1304 human approval evidence. Consumption is atomic with the lifecycle transition.';
