-- P057 Security 002: independent privileged identity, sessions and governed break-glass.
-- No automatic access to tenant data or KMS keys. Runtime logins are provisioned separately.
CREATE TABLE IF NOT EXISTS tpay_admin_principals (
 id text PRIMARY KEY, subject_ref text NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('pending','active','suspended','revoked')),
 assurance_floor text NOT NULL DEFAULT 'hardware_key' CHECK(assurance_floor IN ('webauthn_uv','hardware_key')),
 created_at timestamptz NOT NULL DEFAULT now(), activated_at timestamptz, revoked_at timestamptz,
 CHECK(status <> 'revoked' OR revoked_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS tpay_admin_webauthn_credentials (
 id text PRIMARY KEY, principal_id text NOT NULL REFERENCES tpay_admin_principals(id) ON DELETE RESTRICT,
 credential_id bytea NOT NULL UNIQUE, public_key_cose bytea NOT NULL,
 sign_count bigint NOT NULL DEFAULT 0 CHECK(sign_count >= 0), transports text[] NOT NULL DEFAULT '{}',
 aaguid text, backup_eligible boolean NOT NULL DEFAULT false, backup_state boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspect','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz, revoked_at timestamptz,
 CHECK(status <> 'revoked' OR revoked_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_tpay_admin_webauthn_principal ON tpay_admin_webauthn_credentials(principal_id,status);
CREATE TABLE IF NOT EXISTS tpay_admin_webauthn_challenges (
 id text PRIMARY KEY, principal_id text NOT NULL REFERENCES tpay_admin_principals(id) ON DELETE RESTRICT,
 challenge_hash bytea NOT NULL UNIQUE,
 purpose text NOT NULL CHECK(purpose IN ('registration','authentication','step_up','break_glass_approval')),
 expected_origin text NOT NULL, expected_rp_id text NOT NULL,
 expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_tpay_admin_challenges_expiry ON tpay_admin_webauthn_challenges(expires_at) WHERE consumed_at IS NULL;
CREATE TABLE IF NOT EXISTS tpay_admin_sessions (
 id text PRIMARY KEY, principal_id text NOT NULL REFERENCES tpay_admin_principals(id) ON DELETE RESTRICT,
 credential_id text NOT NULL REFERENCES tpay_admin_webauthn_credentials(id) ON DELETE RESTRICT,
 token_hash bytea NOT NULL UNIQUE, security_plane text NOT NULL DEFAULT 'ADMIN_CONTROL' CHECK(security_plane='ADMIN_CONTROL'),
 assurance text NOT NULL CHECK(assurance IN ('webauthn_uv','hardware_key')),
 origin text NOT NULL, device_key_thumbprint text,
 created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, revoke_reason text,
 CHECK(expires_at > created_at), CHECK(revoked_at IS NULL OR revoke_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_tpay_admin_sessions_active ON tpay_admin_sessions(principal_id,expires_at) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS tpay_admin_breakglass_requests (
 id text PRIMARY KEY, requester_principal_id text NOT NULL REFERENCES tpay_admin_principals(id) ON DELETE RESTRICT,
 target_tenant_id text NOT NULL, target_organization_id text,
 resource_type text NOT NULL CHECK(resource_type IN ('organization_record','school_record','financial_record','vault_metadata','vault_decrypt')),
 resource_ref text NOT NULL, requested_permission text NOT NULL CHECK(requested_permission IN ('metadata_read','record_read','decrypt')),
 purpose_code text NOT NULL, justification text NOT NULL CHECK(length(trim(justification)) BETWEEN 20 AND 2000),
 incident_or_ticket_ref text NOT NULL, status text NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','approved','denied','expired','revoked','consumed')),
 required_approvals smallint NOT NULL DEFAULT 2 CHECK(required_approvals BETWEEN 2 AND 3),
 requested_at timestamptz NOT NULL DEFAULT now(), valid_from timestamptz, expires_at timestamptz,
 consumed_at timestamptz, revoked_at timestamptz,
 CHECK(status <> 'approved' OR (valid_from IS NOT NULL AND expires_at IS NOT NULL AND expires_at > valid_from)),
 CHECK(expires_at IS NULL OR expires_at <= requested_at + interval '60 minutes')
);
CREATE INDEX IF NOT EXISTS idx_tpay_admin_breakglass_pending ON tpay_admin_breakglass_requests(status,requested_at);
CREATE TABLE IF NOT EXISTS tpay_admin_breakglass_approvals (
 request_id text NOT NULL REFERENCES tpay_admin_breakglass_requests(id) ON DELETE RESTRICT,
 approver_principal_id text NOT NULL REFERENCES tpay_admin_principals(id) ON DELETE RESTRICT,
 session_id text NOT NULL REFERENCES tpay_admin_sessions(id) ON DELETE RESTRICT,
 decision text NOT NULL CHECK(decision IN ('approve','deny')), approved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(request_id,approver_principal_id)
);
CREATE TABLE IF NOT EXISTS tpay_admin_security_audit (
 id text PRIMARY KEY, occurred_at timestamptz NOT NULL DEFAULT now(), actor_principal_id text,
 session_id text, action text NOT NULL, target_ref text,
 outcome text NOT NULL CHECK(outcome IN ('allowed','denied','created','revoked','consumed')),
 reason_code text NOT NULL, correlation_id text NOT NULL,
 evidence_sha256 bytea NOT NULL CHECK(octet_length(evidence_sha256)=32)
);
CREATE INDEX IF NOT EXISTS idx_tpay_admin_audit_time ON tpay_admin_security_audit(occurred_at DESC);
CREATE OR REPLACE FUNCTION tpay_guard_admin_breakglass_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE requester text; principal_status text; session_principal text;
 session_assurance text; session_expiry timestamptz; session_revoked timestamptz;
BEGIN
 SELECT requester_principal_id INTO requester FROM public.tpay_admin_breakglass_requests WHERE id=NEW.request_id AND status='pending' FOR UPDATE;
 IF requester IS NULL OR requester=NEW.approver_principal_id THEN RAISE EXCEPTION 'TPAY_BREAKGLASS_SELF_APPROVAL_FORBIDDEN'; END IF;
 SELECT status INTO principal_status FROM public.tpay_admin_principals WHERE id=NEW.approver_principal_id;
 SELECT principal_id,assurance,expires_at,revoked_at INTO session_principal,session_assurance,session_expiry,session_revoked
 FROM public.tpay_admin_sessions WHERE id=NEW.session_id;
 IF principal_status IS DISTINCT FROM 'active' OR session_principal IS DISTINCT FROM NEW.approver_principal_id
 OR session_assurance IS DISTINCT FROM 'hardware_key' OR session_revoked IS NOT NULL OR session_expiry<=now()
 THEN RAISE EXCEPTION 'TPAY_BREAKGLASS_APPROVER_SESSION_INVALID'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tpay_admin_breakglass_approval_guard ON tpay_admin_breakglass_approvals;
CREATE TRIGGER tpay_admin_breakglass_approval_guard BEFORE INSERT ON tpay_admin_breakglass_approvals
FOR EACH ROW EXECUTE FUNCTION tpay_guard_admin_breakglass_approval();
CREATE OR REPLACE FUNCTION tpay_reject_admin_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TPAY_ADMIN_AUDIT_APPEND_ONLY'; END $$;
DROP TRIGGER IF EXISTS tpay_admin_audit_no_update ON tpay_admin_security_audit;
CREATE TRIGGER tpay_admin_audit_no_update BEFORE UPDATE OR DELETE ON tpay_admin_security_audit
FOR EACH ROW EXECUTE FUNCTION tpay_reject_admin_audit_mutation();
DROP TRIGGER IF EXISTS tpay_admin_audit_no_truncate ON tpay_admin_security_audit;
CREATE TRIGGER tpay_admin_audit_no_truncate BEFORE TRUNCATE ON tpay_admin_security_audit
FOR EACH STATEMENT EXECUTE FUNCTION tpay_reject_admin_audit_mutation();
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['tpay_admin_principals','tpay_admin_webauthn_credentials','tpay_admin_webauthn_challenges',
 'tpay_admin_sessions','tpay_admin_breakglass_requests','tpay_admin_breakglass_approvals','tpay_admin_security_audit']
 LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t); END LOOP;
END $$;
REVOKE ALL ON tpay_admin_principals,tpay_admin_webauthn_credentials,tpay_admin_webauthn_challenges,
 tpay_admin_sessions,tpay_admin_breakglass_requests,tpay_admin_breakglass_approvals,tpay_admin_security_audit FROM PUBLIC;

-- Approval quorum is checked atomically when a request transitions to approved.
CREATE OR REPLACE FUNCTION tpay_guard_admin_breakglass_approval_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE approved_count integer;
BEGIN
 IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
   IF NEW.valid_from IS NULL OR NEW.expires_at IS NULL OR NEW.expires_at<=now()
      OR NEW.expires_at<=NEW.valid_from
      OR NEW.expires_at>NEW.valid_from+interval '60 minutes' THEN
     RAISE EXCEPTION 'TPAY_BREAKGLASS_VALIDITY_WINDOW_INVALID';
   END IF;
   SELECT count(DISTINCT approver_principal_id) INTO approved_count
   FROM public.tpay_admin_breakglass_approvals
   WHERE request_id=NEW.id AND decision='approve';
   IF approved_count<NEW.required_approvals THEN
     RAISE EXCEPTION 'TPAY_BREAKGLASS_APPROVAL_QUORUM_NOT_MET';
   END IF;
 END IF;
 IF OLD.status IN ('denied','expired','revoked','consumed')
    AND NEW.status IS DISTINCT FROM OLD.status THEN
   RAISE EXCEPTION 'TPAY_BREAKGLASS_TERMINAL_STATE_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tpay_admin_breakglass_transition_guard ON tpay_admin_breakglass_requests;
CREATE TRIGGER tpay_admin_breakglass_transition_guard
BEFORE UPDATE OF status,valid_from,expires_at ON tpay_admin_breakglass_requests
FOR EACH ROW EXECUTE FUNCTION tpay_guard_admin_breakglass_approval_transition();

CREATE OR REPLACE FUNCTION tpay_reject_admin_approval_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'TPAY_ADMIN_APPROVALS_APPEND_ONLY'; END $$;
DROP TRIGGER IF EXISTS tpay_admin_approval_no_update ON tpay_admin_breakglass_approvals;
CREATE TRIGGER tpay_admin_approval_no_update BEFORE UPDATE OR DELETE ON tpay_admin_breakglass_approvals
FOR EACH ROW EXECUTE FUNCTION tpay_reject_admin_approval_mutation();
DROP TRIGGER IF EXISTS tpay_admin_approval_no_truncate ON tpay_admin_breakglass_approvals;
CREATE TRIGGER tpay_admin_approval_no_truncate BEFORE TRUNCATE ON tpay_admin_breakglass_approvals
FOR EACH STATEMENT EXECUTE FUNCTION tpay_reject_admin_approval_mutation();
