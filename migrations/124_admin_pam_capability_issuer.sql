-- P060: isolated Admin PAM capability issuer. This role never receives tenant-data access.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='tpay_admin_pam_runtime') THEN
  CREATE ROLE tpay_admin_pam_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
END $$;
ALTER ROLE tpay_admin_pam_runtime WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

CREATE TABLE IF NOT EXISTS tpay_admin_pam_capabilities (
 id text PRIMARY KEY,
 request_id text NOT NULL UNIQUE REFERENCES tpay_admin_breakglass_requests(id) ON DELETE RESTRICT,
 principal_id text NOT NULL REFERENCES tpay_admin_principals(id) ON DELETE RESTRICT,
 session_id text NOT NULL REFERENCES tpay_admin_sessions(id) ON DELETE RESTRICT,
 token_hash bytea NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
 target_tenant_id text NOT NULL,
 target_organization_id text,
 resource_type text NOT NULL,
 resource_ref text NOT NULL,
 permission text NOT NULL,
 purpose_code text NOT NULL,
 ticket_ref text NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 consumed_at timestamptz,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '60 minutes'),
 CHECK(revoked_at IS NULL OR consumed_at IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_tpay_admin_pam_capability_scope
 ON tpay_admin_pam_capabilities(target_tenant_id,target_organization_id,resource_type,resource_ref,permission)
 WHERE revoked_at IS NULL AND consumed_at IS NULL;

CREATE OR REPLACE FUNCTION tpay_guard_admin_pam_capability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.id IS DISTINCT FROM NEW.id OR OLD.request_id IS DISTINCT FROM NEW.request_id
 OR OLD.principal_id IS DISTINCT FROM NEW.principal_id OR OLD.session_id IS DISTINCT FROM NEW.session_id
 OR OLD.token_hash IS DISTINCT FROM NEW.token_hash OR OLD.target_tenant_id IS DISTINCT FROM NEW.target_tenant_id
 OR OLD.target_organization_id IS DISTINCT FROM NEW.target_organization_id
 OR OLD.resource_type IS DISTINCT FROM NEW.resource_type OR OLD.resource_ref IS DISTINCT FROM NEW.resource_ref
 OR OLD.permission IS DISTINCT FROM NEW.permission OR OLD.purpose_code IS DISTINCT FROM NEW.purpose_code
 OR OLD.ticket_ref IS DISTINCT FROM NEW.ticket_ref OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
 OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
 OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
 OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at)
 OR (NEW.revoked_at IS NOT NULL AND NEW.consumed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'TPAY_ADMIN_PAM_CAPABILITY_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tpay_admin_pam_capability_guard ON tpay_admin_pam_capabilities;
CREATE TRIGGER tpay_admin_pam_capability_guard BEFORE UPDATE ON tpay_admin_pam_capabilities
 FOR EACH ROW EXECUTE FUNCTION tpay_guard_admin_pam_capability();

ALTER TABLE tpay_admin_pam_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tpay_admin_pam_capabilities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON tpay_admin_pam_capabilities FROM PUBLIC,tpay_admin_pam_runtime;
GRANT SELECT,INSERT,UPDATE ON tpay_admin_pam_capabilities TO tpay_admin_pam_runtime;
GRANT SELECT ON tpay_admin_principals,tpay_admin_webauthn_credentials,tpay_admin_sessions,
 tpay_admin_breakglass_requests,tpay_admin_breakglass_approvals TO tpay_admin_pam_runtime;
GRANT INSERT ON tpay_admin_security_audit TO tpay_admin_pam_runtime;

DO $p060$
BEGIN
 DROP POLICY IF EXISTS p060_admin_pam_principal_select ON tpay_admin_principals;
 DROP POLICY IF EXISTS p060_admin_pam_credential_select ON tpay_admin_webauthn_credentials;
 DROP POLICY IF EXISTS p060_admin_pam_session_select ON tpay_admin_sessions;
 DROP POLICY IF EXISTS p060_admin_pam_request_select ON tpay_admin_breakglass_requests;
 DROP POLICY IF EXISTS p060_admin_pam_request_update ON tpay_admin_breakglass_requests;
 DROP POLICY IF EXISTS p060_admin_pam_approval_select ON tpay_admin_breakglass_approvals;
 DROP POLICY IF EXISTS p060_admin_pam_audit_insert ON tpay_admin_security_audit;
 DROP POLICY IF EXISTS p060_admin_pam_capability_scope ON tpay_admin_pam_capabilities;
END $p060$;
DO $p060_create$
BEGIN
 CREATE POLICY p060_admin_pam_principal_select ON tpay_admin_principals
  FOR SELECT TO tpay_admin_pam_runtime
  USING (id=current_setting('tpay.admin_principal_id',true)
    OR id IN (SELECT a.approver_principal_id FROM tpay_admin_breakglass_approvals a
      WHERE a.request_id=current_setting('tpay.admin_request_id',true) AND a.decision='approve'));
 CREATE POLICY p060_admin_pam_credential_select ON tpay_admin_webauthn_credentials
  FOR SELECT TO tpay_admin_pam_runtime
  USING (principal_id=current_setting('tpay.admin_principal_id',true)
    OR id IN (SELECT s.credential_id FROM tpay_admin_sessions s
      WHERE s.id IN (SELECT a.session_id FROM tpay_admin_breakglass_approvals a
       WHERE a.request_id=current_setting('tpay.admin_request_id',true) AND a.decision='approve')));
 CREATE POLICY p060_admin_pam_session_select ON tpay_admin_sessions
  FOR SELECT TO tpay_admin_pam_runtime
  USING ((principal_id=current_setting('tpay.admin_principal_id',true)
      AND id=current_setting('tpay.admin_session_id',true))
    OR id IN (SELECT a.session_id FROM tpay_admin_breakglass_approvals a
      WHERE a.request_id=current_setting('tpay.admin_request_id',true) AND a.decision='approve'));
 CREATE POLICY p060_admin_pam_request_select ON tpay_admin_breakglass_requests
  FOR SELECT TO tpay_admin_pam_runtime
  USING (requester_principal_id=current_setting('tpay.admin_principal_id',true)
    AND id=current_setting('tpay.admin_request_id',true));
 CREATE POLICY p060_admin_pam_request_update ON tpay_admin_breakglass_requests
  FOR UPDATE TO tpay_admin_pam_runtime
  USING (requester_principal_id=current_setting('tpay.admin_principal_id',true)
    AND id=current_setting('tpay.admin_request_id',true) AND status='approved')
  WITH CHECK (requester_principal_id=current_setting('tpay.admin_principal_id',true)
    AND id=current_setting('tpay.admin_request_id',true) AND status='consumed');
 CREATE POLICY p060_admin_pam_approval_select ON tpay_admin_breakglass_approvals
  FOR SELECT TO tpay_admin_pam_runtime
  USING (request_id=current_setting('tpay.admin_request_id',true));
 CREATE POLICY p060_admin_pam_audit_insert ON tpay_admin_security_audit
  FOR INSERT TO tpay_admin_pam_runtime
  WITH CHECK (actor_principal_id=current_setting('tpay.admin_principal_id',true)
   AND session_id=current_setting('tpay.admin_session_id',true));
 CREATE POLICY p060_admin_pam_capability_scope ON tpay_admin_pam_capabilities
  FOR ALL TO tpay_admin_pam_runtime
  USING (principal_id=current_setting('tpay.admin_principal_id',true)
   AND session_id=current_setting('tpay.admin_session_id',true))
  WITH CHECK (principal_id=current_setting('tpay.admin_principal_id',true)
   AND session_id=current_setting('tpay.admin_session_id',true));
END $p060_create$;

-- This broker only issues an opaque, exact-scope, one-use capability.
-- It cannot SELECT tenant records, ciphertext, plaintext, vault keys, or KMS material.
