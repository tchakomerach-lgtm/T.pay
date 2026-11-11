-- P063: hardware-backed WebAuthn attestation trust and registration evidence.
-- Trust anchors are provisioned through a separate, reviewed administrative ceremony.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='tpay_admin_webauthn_enroll_runtime') THEN
  CREATE ROLE tpay_admin_webauthn_enroll_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
END $$;
ALTER ROLE tpay_admin_webauthn_enroll_runtime WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

CREATE TABLE IF NOT EXISTS tpay_admin_webauthn_attestation_roots (
 id text PRIMARY KEY,
 fingerprint_sha256 text NOT NULL UNIQUE CHECK(fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
 vendor_ref text NOT NULL,
 metadata_version text NOT NULL,
 source_uri text NOT NULL CHECK(source_uri LIKE 'https://%'),
 allowed_aaguids text[] NOT NULL CHECK(cardinality(allowed_aaguids)>0),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
 trusted_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 CHECK(status <> 'revoked' OR revoked_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_tpay_admin_attestation_roots_active
 ON tpay_admin_webauthn_attestation_roots(fingerprint_sha256) WHERE status='active';

ALTER TABLE tpay_admin_webauthn_credentials
 ADD COLUMN IF NOT EXISTS hardware_attested boolean NOT NULL DEFAULT false;
ALTER TABLE tpay_admin_webauthn_credentials
 ADD COLUMN IF NOT EXISTS attestation_format text;
ALTER TABLE tpay_admin_webauthn_credentials
 ADD COLUMN IF NOT EXISTS attestation_root_fingerprint text;
ALTER TABLE tpay_admin_webauthn_credentials
 ADD COLUMN IF NOT EXISTS attested_at timestamptz;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tpay_admin_credential_attestation_state_ck') THEN
  ALTER TABLE tpay_admin_webauthn_credentials ADD CONSTRAINT tpay_admin_credential_attestation_state_ck
   CHECK ((hardware_attested=false AND attestation_format IS NULL AND attestation_root_fingerprint IS NULL AND attested_at IS NULL)
       OR (hardware_attested=true AND attestation_format='packed' AND attestation_root_fingerprint IS NOT NULL AND attestation_root_fingerprint ~ '^[0-9a-f]{64}
 END IF;
END $$;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tpay_admin_credential_attestation_root_fk') THEN
  ALTER TABLE tpay_admin_webauthn_credentials ADD CONSTRAINT tpay_admin_credential_attestation_root_fk
   FOREIGN KEY(attestation_root_fingerprint) REFERENCES tpay_admin_webauthn_attestation_roots(fingerprint_sha256) ON DELETE RESTRICT;
 END IF;
END $$;

ALTER TABLE tpay_admin_webauthn_attestation_roots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tpay_admin_webauthn_attestation_roots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON tpay_admin_webauthn_attestation_roots FROM PUBLIC,tpay_admin_webauthn_enroll_runtime;
GRANT SELECT ON tpay_admin_webauthn_attestation_roots TO tpay_admin_webauthn_enroll_runtime;
GRANT SELECT,INSERT,UPDATE ON tpay_admin_webauthn_credentials TO tpay_admin_webauthn_enroll_runtime;
GRANT SELECT,UPDATE ON tpay_admin_webauthn_challenges TO tpay_admin_webauthn_enroll_runtime;
GRANT SELECT,UPDATE ON tpay_admin_principals TO tpay_admin_webauthn_enroll_runtime;
GRANT INSERT ON tpay_admin_security_audit TO tpay_admin_webauthn_enroll_runtime;

DO $p063$
BEGIN
 DROP POLICY IF EXISTS p063_attestation_root_select ON tpay_admin_webauthn_attestation_roots;
 DROP POLICY IF EXISTS p063_attestation_credential_select ON tpay_admin_webauthn_credentials;
 DROP POLICY IF EXISTS p063_attestation_credential_insert ON tpay_admin_webauthn_credentials;
 DROP POLICY IF EXISTS p063_attestation_challenge_select ON tpay_admin_webauthn_challenges;
 DROP POLICY IF EXISTS p063_attestation_challenge_update ON tpay_admin_webauthn_challenges;
 DROP POLICY IF EXISTS p063_attestation_principal_select ON tpay_admin_principals;
 DROP POLICY IF EXISTS p063_attestation_audit_insert ON tpay_admin_security_audit;
END $p063$;
DO $p063_create$
BEGIN
 CREATE POLICY p063_attestation_root_select ON tpay_admin_webauthn_attestation_roots
  FOR SELECT TO tpay_admin_webauthn_enroll_runtime USING(status='active');
 CREATE POLICY p063_attestation_credential_select ON tpay_admin_webauthn_credentials
  FOR SELECT TO tpay_admin_webauthn_enroll_runtime
  USING(principal_id=current_setting('tpay.admin_principal_id',true));
 CREATE POLICY p063_attestation_credential_insert ON tpay_admin_webauthn_credentials
  FOR INSERT TO tpay_admin_webauthn_enroll_runtime
  WITH CHECK(principal_id=current_setting('tpay.admin_principal_id',true) AND hardware_attested=true);
 CREATE POLICY p063_attestation_challenge_select ON tpay_admin_webauthn_challenges
  FOR SELECT TO tpay_admin_webauthn_enroll_runtime
  USING(principal_id=current_setting('tpay.admin_principal_id',true) AND purpose='registration');
 CREATE POLICY p063_attestation_challenge_update ON tpay_admin_webauthn_challenges
  FOR UPDATE TO tpay_admin_webauthn_enroll_runtime
  USING(principal_id=current_setting('tpay.admin_principal_id',true) AND purpose='registration' AND consumed_at IS NULL)
  WITH CHECK(principal_id=current_setting('tpay.admin_principal_id',true) AND purpose='registration' AND consumed_at IS NOT NULL);
 CREATE POLICY p063_attestation_principal_select ON tpay_admin_principals
  FOR SELECT TO tpay_admin_webauthn_enroll_runtime
  USING(id=current_setting('tpay.admin_principal_id',true));
 CREATE POLICY p063_attestation_audit_insert ON tpay_admin_security_audit
  FOR INSERT TO tpay_admin_webauthn_enroll_runtime
  WITH CHECK(actor_principal_id=current_setting('tpay.admin_principal_id',true));
END $p063_create$;

CREATE OR REPLACE FUNCTION tpay_guard_admin_attestation_root()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.id IS DISTINCT FROM NEW.id
 OR OLD.fingerprint_sha256 IS DISTINCT FROM NEW.fingerprint_sha256
 OR OLD.vendor_ref IS DISTINCT FROM NEW.vendor_ref
 OR OLD.metadata_version IS DISTINCT FROM NEW.metadata_version
 OR OLD.source_uri IS DISTINCT FROM NEW.source_uri
 OR OLD.allowed_aaguids IS DISTINCT FROM NEW.allowed_aaguids
 OR OLD.trusted_at IS DISTINCT FROM NEW.trusted_at
 OR (OLD.status='revoked' AND NEW.status IS DISTINCT FROM 'revoked')
 OR (NEW.status='revoked' AND NEW.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'TPAY_ATTESTATION_ROOT_IMMUTABLE_OR_INVALID_TRANSITION'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tpay_admin_attestation_root_guard ON tpay_admin_webauthn_attestation_roots;
CREATE TRIGGER tpay_admin_attestation_root_guard BEFORE UPDATE ON tpay_admin_webauthn_attestation_roots
 FOR EACH ROW EXECUTE FUNCTION tpay_guard_admin_attestation_root();

-- No root is trusted by default. Add fingerprints only after independent vendor
-- metadata validation, offline certificate review and dual-control approval.
 AND attested_at IS NOT NULL));
 END IF;
END $$;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tpay_admin_credential_attestation_root_fk') THEN
  ALTER TABLE tpay_admin_webauthn_credentials ADD CONSTRAINT tpay_admin_credential_attestation_root_fk
   FOREIGN KEY(attestation_root_fingerprint) REFERENCES tpay_admin_webauthn_attestation_roots(fingerprint_sha256) ON DELETE RESTRICT;
 END IF;
END $$;

ALTER TABLE tpay_admin_webauthn_attestation_roots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tpay_admin_webauthn_attestation_roots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON tpay_admin_webauthn_attestation_roots FROM PUBLIC,tpay_admin_webauthn_enroll_runtime;
GRANT SELECT ON tpay_admin_webauthn_attestation_roots TO tpay_admin_webauthn_enroll_runtime;
GRANT SELECT,INSERT,UPDATE ON tpay_admin_webauthn_credentials TO tpay_admin_webauthn_enroll_runtime;
GRANT SELECT,UPDATE ON tpay_admin_webauthn_challenges TO tpay_admin_webauthn_enroll_runtime;
GRANT SELECT,UPDATE ON tpay_admin_principals TO tpay_admin_webauthn_enroll_runtime;
GRANT INSERT ON tpay_admin_security_audit TO tpay_admin_webauthn_enroll_runtime;

DO $p063$
BEGIN
 DROP POLICY IF EXISTS p063_attestation_root_select ON tpay_admin_webauthn_attestation_roots;
 DROP POLICY IF EXISTS p063_attestation_credential_select ON tpay_admin_webauthn_credentials;
 DROP POLICY IF EXISTS p063_attestation_credential_insert ON tpay_admin_webauthn_credentials;
 DROP POLICY IF EXISTS p063_attestation_challenge_select ON tpay_admin_webauthn_challenges;
 DROP POLICY IF EXISTS p063_attestation_challenge_update ON tpay_admin_webauthn_challenges;
 DROP POLICY IF EXISTS p063_attestation_principal_select ON tpay_admin_principals;
 DROP POLICY IF EXISTS p063_attestation_audit_insert ON tpay_admin_security_audit;
END $p063$;
DO $p063_create$
BEGIN
 CREATE POLICY p063_attestation_root_select ON tpay_admin_webauthn_attestation_roots
  FOR SELECT TO tpay_admin_webauthn_enroll_runtime USING(status='active');
 CREATE POLICY p063_attestation_credential_select ON tpay_admin_webauthn_credentials
  FOR SELECT TO tpay_admin_webauthn_enroll_runtime
  USING(principal_id=current_setting('tpay.admin_principal_id',true));
 CREATE POLICY p063_attestation_credential_insert ON tpay_admin_webauthn_credentials
  FOR INSERT TO tpay_admin_webauthn_enroll_runtime
  WITH CHECK(principal_id=current_setting('tpay.admin_principal_id',true) AND hardware_attested=true);
 CREATE POLICY p063_attestation_challenge_select ON tpay_admin_webauthn_challenges
  FOR SELECT TO tpay_admin_webauthn_enroll_runtime
  USING(principal_id=current_setting('tpay.admin_principal_id',true) AND purpose='registration');
 CREATE POLICY p063_attestation_challenge_update ON tpay_admin_webauthn_challenges
  FOR UPDATE TO tpay_admin_webauthn_enroll_runtime
  USING(principal_id=current_setting('tpay.admin_principal_id',true) AND purpose='registration' AND consumed_at IS NULL)
  WITH CHECK(principal_id=current_setting('tpay.admin_principal_id',true) AND purpose='registration' AND consumed_at IS NOT NULL);
 CREATE POLICY p063_attestation_principal_select ON tpay_admin_principals
  FOR SELECT TO tpay_admin_webauthn_enroll_runtime
  USING(id=current_setting('tpay.admin_principal_id',true));
 CREATE POLICY p063_attestation_audit_insert ON tpay_admin_security_audit
  FOR INSERT TO tpay_admin_webauthn_enroll_runtime
  WITH CHECK(actor_principal_id=current_setting('tpay.admin_principal_id',true));
END $p063_create$;

CREATE OR REPLACE FUNCTION tpay_guard_admin_attestation_root()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.id IS DISTINCT FROM NEW.id
 OR OLD.fingerprint_sha256 IS DISTINCT FROM NEW.fingerprint_sha256
 OR OLD.vendor_ref IS DISTINCT FROM NEW.vendor_ref
 OR OLD.metadata_version IS DISTINCT FROM NEW.metadata_version
 OR OLD.source_uri IS DISTINCT FROM NEW.source_uri
 OR OLD.allowed_aaguids IS DISTINCT FROM NEW.allowed_aaguids
 OR OLD.trusted_at IS DISTINCT FROM NEW.trusted_at
 OR (OLD.status='revoked' AND NEW.status IS DISTINCT FROM 'revoked')
 OR (NEW.status='revoked' AND NEW.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'TPAY_ATTESTATION_ROOT_IMMUTABLE_OR_INVALID_TRANSITION'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tpay_admin_attestation_root_guard ON tpay_admin_webauthn_attestation_roots;
CREATE TRIGGER tpay_admin_attestation_root_guard BEFORE UPDATE ON tpay_admin_webauthn_attestation_roots
 FOR EACH ROW EXECUTE FUNCTION tpay_guard_admin_attestation_root();

-- No root is trusted by default. Add fingerprints only after independent vendor
-- metadata validation, offline certificate review and dual-control approval.
