-- P058: record-level compartmentalization for the Fortress/Vault architecture.
-- Ciphertext only. No plaintext DEKs or KMS credentials are stored in PostgreSQL.
-- RLS is forced and intentionally has no permissive policies until the dedicated
-- data access broker and narrowly scoped DB roles are deployed.

CREATE TABLE IF NOT EXISTS tpay_data_compartments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text,
  subject_ref text NOT NULL,
  module_code text NOT NULL,
  data_class text NOT NULL CHECK (data_class IN (
    'identity','guardianship','academic','attendance','health',
    'safeguarding','finance','documents','communications','biometric',
    'employment','customer_profile','transactions','credentials',
    'ai_memory','voice','social_graph','marketplace','audit_evidence'
  )),
  vault_id text NOT NULL,
  isolation_domain text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','sealed','suspended','destroyed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sealed_at timestamptz,
  destroyed_at timestamptz,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,subject_ref,module_code,data_class),
  UNIQUE (tenant_id,vault_id),
  FOREIGN KEY (tenant_id,vault_id) REFERENCES tpay_vaults(tenant_id,id) ON DELETE RESTRICT,
  CHECK ((status <> 'sealed') OR sealed_at IS NOT NULL),
  CHECK ((status <> 'destroyed') OR destroyed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_tpay_data_compartments_subject
 ON tpay_data_compartments(tenant_id,subject_ref,module_code,data_class);

CREATE TABLE IF NOT EXISTS tpay_data_compartment_key_versions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  compartment_id text NOT NULL,
  key_version integer NOT NULL CHECK (key_version > 0),
  kms_key_ref text NOT NULL,
  wrapped_data_key bytea NOT NULL,
  algorithm text NOT NULL CHECK (algorithm IN ('AES-256-GCM')),
  wrapping_algorithm text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','retiring','revoked','destroyed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  UNIQUE (tenant_id,compartment_id,key_version),
  FOREIGN KEY (tenant_id,compartment_id)
    REFERENCES tpay_data_compartments(tenant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tpay_compartment_active_key
 ON tpay_data_compartment_key_versions(tenant_id,compartment_id)
 WHERE status='active';

CREATE TABLE IF NOT EXISTS tpay_data_records (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text,
  compartment_id text NOT NULL,
  record_type text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  key_version integer NOT NULL CHECK (key_version > 0),
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL CHECK (octet_length(nonce)=12),
  auth_tag bytea NOT NULL CHECK (octet_length(auth_tag)=16),
  aad_sha256 bytea NOT NULL CHECK (octet_length(aad_sha256)=32),
  payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256)=32),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  record_state text NOT NULL DEFAULT 'active' CHECK (record_state IN ('active','sealed','tombstoned')),
  FOREIGN KEY (tenant_id,compartment_id)
    REFERENCES tpay_data_compartments(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,compartment_id,key_version)
    REFERENCES tpay_data_compartment_key_versions(tenant_id,compartment_id,key_version) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_tpay_data_records_compartment
 ON tpay_data_records(tenant_id,compartment_id,record_state);

CREATE TABLE IF NOT EXISTS tpay_data_record_grants (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text,
  record_id text NOT NULL,
  actor_id text NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('user','workload','privileged')),
  permission text NOT NULL CHECK (permission IN ('metadata_read','read','write','decrypt','seal','revoke')),
  purpose_code text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses_count integer NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,record_id) REFERENCES tpay_data_records(tenant_id,id) ON DELETE RESTRICT,
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (max_uses IS NULL OR uses_count <= max_uses)
);
CREATE INDEX IF NOT EXISTS idx_tpay_record_grants_exact
 ON tpay_data_record_grants(tenant_id,record_id,actor_id,permission)
 WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS tpay_data_access_audit (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text,
  compartment_id text NOT NULL,
  record_id text,
  actor_id text NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('user','workload','privileged')),
  session_ref text NOT NULL,
  permission text NOT NULL,
  purpose_code text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('allowed','denied')),
  reason_code text NOT NULL,
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  evidence_sha256 bytea NOT NULL CHECK (octet_length(evidence_sha256)=32),
  FOREIGN KEY (tenant_id,compartment_id)
    REFERENCES tpay_data_compartments(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_tpay_data_access_audit_tenant_time
 ON tpay_data_access_audit(tenant_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpay_data_access_audit_record
 ON tpay_data_access_audit(tenant_id,record_id,occurred_at DESC);

-- Audit is append-only, including TRUNCATE.
CREATE OR REPLACE FUNCTION tpay_reject_data_access_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'TPAY_DATA_ACCESS_AUDIT_APPEND_ONLY'; END $$;
DROP TRIGGER IF EXISTS tpay_data_audit_no_update ON tpay_data_access_audit;
CREATE TRIGGER tpay_data_audit_no_update BEFORE UPDATE OR DELETE ON tpay_data_access_audit
 FOR EACH ROW EXECUTE FUNCTION tpay_reject_data_access_audit_mutation();
DROP TRIGGER IF EXISTS tpay_data_audit_no_truncate ON tpay_data_access_audit;
CREATE TRIGGER tpay_data_audit_no_truncate BEFORE TRUNCATE ON tpay_data_access_audit
 FOR EACH STATEMENT EXECUTE FUNCTION tpay_reject_data_access_audit_mutation();

-- The ordinary application roles receive no implicit access from this migration.
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'tpay_data_compartments','tpay_data_compartment_key_versions',
  'tpay_data_records','tpay_data_record_grants','tpay_data_access_audit'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
REVOKE ALL ON tpay_data_compartments,tpay_data_compartment_key_versions,
 tpay_data_records,tpay_data_record_grants,tpay_data_access_audit FROM PUBLIC;
