CREATE TABLE IF NOT EXISTS fortress_root_approvals (
 operation_id TEXT NOT NULL,
 approver_id TEXT NOT NULL,
 role TEXT NOT NULL,
 approved_at TIMESTAMPTZ NOT NULL,
 approval_hash TEXT NOT NULL,
 PRIMARY KEY(operation_id,approver_id)
);
CREATE INDEX IF NOT EXISTS fortress_root_approvals_time_idx ON fortress_root_approvals(operation_id,approved_at DESC);
ALTER TABLE fortress_root_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fortress_root_approvals FROM PUBLIC;
CREATE POLICY fortress_root_approvals_operator_only ON fortress_root_approvals
 USING (current_user='tpay_fortress_operator')
 WITH CHECK (current_user='tpay_fortress_operator');