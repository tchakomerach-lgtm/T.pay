-- L10.2: PostgreSQL invariants for organization sessions and AI approvals.
ALTER TABLE organization_roles ADD CONSTRAINT organization_roles_org_id_id_uq UNIQUE (organization_id,id);
ALTER TABLE organization_sessions
  ADD CONSTRAINT organization_sessions_org_user_fk
  FOREIGN KEY (organization_id,user_id) REFERENCES organization_members(organization_id,user_id);
CREATE INDEX IF NOT EXISTS idx_org_sessions_expiry ON organization_sessions(expires_at) WHERE revoked_at IS NULL;

ALTER TABLE ai_runs ADD CONSTRAINT ai_runs_org_id_uq UNIQUE (organization_id,id);
ALTER TABLE ai_approval_requests
  ADD CONSTRAINT ai_approval_requests_org_run_fk
  FOREIGN KEY (organization_id,ai_run_id) REFERENCES ai_runs(organization_id,id);
CREATE INDEX IF NOT EXISTS idx_ai_approval_pending ON ai_approval_requests(organization_id,status,requested_action) WHERE status='pending';
