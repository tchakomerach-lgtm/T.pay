-- P064: bind the hardware assurance claim to a live, pinned attestation root.
-- Revoking a root immediately blocks new hardware sessions, session validation,
-- PAM capability issuance and new break-glass approvals.
GRANT SELECT ON tpay_admin_webauthn_attestation_roots
 TO tpay_admin_runtime,tpay_admin_pam_runtime;

DROP POLICY IF EXISTS p064_admin_runtime_attestation_root_select
 ON tpay_admin_webauthn_attestation_roots;
CREATE POLICY p064_admin_runtime_attestation_root_select
 ON tpay_admin_webauthn_attestation_roots
 FOR SELECT TO tpay_admin_runtime USING(status='active');

DROP POLICY IF EXISTS p064_pam_runtime_attestation_root_select
 ON tpay_admin_webauthn_attestation_roots;
CREATE POLICY p064_pam_runtime_attestation_root_select
 ON tpay_admin_webauthn_attestation_roots
 FOR SELECT TO tpay_admin_pam_runtime USING(status='active');

-- Keep the database-side break-glass approval guard authoritative. Application
-- checks alone cannot establish hardware assurance for an approver.
CREATE OR REPLACE FUNCTION tpay_guard_admin_breakglass_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
SET row_security=off
AS $$
DECLARE
 requester text;
 principal_status text;
 session_principal text;
 session_assurance text;
 session_expiry timestamptz;
 session_revoked timestamptz;
 credential_attested boolean;
 root_status text;
BEGIN
 SELECT requester_principal_id INTO requester
   FROM public.tpay_admin_breakglass_requests
  WHERE id=NEW.request_id AND status='pending' FOR UPDATE;
 IF requester IS NULL OR requester=NEW.approver_principal_id THEN
  RAISE EXCEPTION 'TPAY_BREAKGLASS_SELF_APPROVAL_FORBIDDEN';
 END IF;

 SELECT status INTO principal_status
   FROM public.tpay_admin_principals WHERE id=NEW.approver_principal_id;

 SELECT s.principal_id,s.assurance,s.expires_at,s.revoked_at,
        c.hardware_attested,r.status
   INTO session_principal,session_assurance,session_expiry,session_revoked,
        credential_attested,root_status
   FROM public.tpay_admin_sessions s
   JOIN public.tpay_admin_webauthn_credentials c ON c.id=s.credential_id
   LEFT JOIN public.tpay_admin_webauthn_attestation_roots r
     ON r.fingerprint_sha256=c.attestation_root_fingerprint
  WHERE s.id=NEW.session_id;

 IF principal_status IS DISTINCT FROM 'active'
 OR session_principal IS DISTINCT FROM NEW.approver_principal_id
 OR session_assurance IS DISTINCT FROM 'hardware_key'
 OR session_revoked IS NOT NULL OR session_expiry<=now()
 OR credential_attested IS DISTINCT FROM true
 OR root_status IS DISTINCT FROM 'active'
 THEN RAISE EXCEPTION 'TPAY_BREAKGLASS_APPROVER_SESSION_INVALID'; END IF;
 RETURN NEW;
END $$;

COMMENT ON FUNCTION tpay_guard_admin_breakglass_approval() IS
'P064: break-glass approver must have an active Admin session backed by an attested WebAuthn credential and a currently active pinned trust root.';
