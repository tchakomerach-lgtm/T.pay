-- P059: least-privilege runtime boundary for the P058 data compartment broker.
-- The role is NOLOGIN, NOSUPERUSER and NOBYPASSRLS. No Admin membership is granted.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='tpay_data_broker_runtime') THEN
    CREATE ROLE tpay_data_broker_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
ALTER ROLE tpay_data_broker_runtime WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
REVOKE ALL ON tpay_data_compartments,tpay_data_compartment_key_versions,
  tpay_data_records,tpay_data_record_grants,tpay_data_access_audit FROM tpay_data_broker_runtime;
GRANT SELECT ON tpay_data_compartments,tpay_data_compartment_key_versions,
  tpay_data_records,tpay_data_record_grants TO tpay_data_broker_runtime;
GRANT UPDATE (uses_count) ON tpay_data_record_grants TO tpay_data_broker_runtime;
GRANT INSERT ON tpay_data_access_audit TO tpay_data_broker_runtime;


-- One permissive tenant gate plus restrictive policies below. PostgreSQL combines
-- permissive policies with OR and restrictive policies with AND, preventing a
-- later broad permissive policy from overriding the exact compartment rules.
DO $p059$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tpay_data_compartments','tpay_data_compartment_key_versions',
    'tpay_data_records','tpay_data_record_grants','tpay_data_access_audit'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS p059_broker_tenant_gate ON %I',table_name);
    EXECUTE format(
      'CREATE POLICY p059_broker_tenant_gate ON %I FOR ALL TO tpay_data_broker_runtime USING (tenant_id=current_setting(''tpay.tenant_id'',true) AND current_setting(''tpay.security_plane'',true) IN (''USER'',''ORGANIZATION'',''SERVICE'')) WITH CHECK (tenant_id=current_setting(''tpay.tenant_id'',true) AND current_setting(''tpay.security_plane'',true) IN (''USER'',''ORGANIZATION'',''SERVICE''))',
      table_name
    );
  END LOOP;
END $p059$;

DROP POLICY IF EXISTS p059_broker_compartment_select ON tpay_data_compartments;
CREATE POLICY p059_broker_compartment_select ON tpay_data_compartments AS RESTRICTIVE
  FOR SELECT TO tpay_data_broker_runtime
  USING (
    tenant_id=current_setting('tpay.tenant_id',true)
    AND organization_id IS NOT DISTINCT FROM NULLIF(current_setting('tpay.organization_id',true),'')
    AND id=current_setting('tpay.compartment_id',true)
    AND subject_ref=current_setting('tpay.subject_ref',true)
    AND module_code=current_setting('tpay.module_code',true)
    AND data_class=current_setting('tpay.data_class',true)
    AND vault_id=current_setting('tpay.vault_id',true)
    AND current_setting('tpay.security_plane',true) IN ('USER','ORGANIZATION','SERVICE')
  );

-- This SELECT policy exposes only grants for the exact actor/record/purpose.
-- The max-use predicate is enforced by UPDATE, not SELECT, so the consumed grant
-- remains visible to the record/key RLS policies during the same transaction.
DROP POLICY IF EXISTS p059_broker_grant_select ON tpay_data_record_grants;
CREATE POLICY p059_broker_grant_select ON tpay_data_record_grants AS RESTRICTIVE
  FOR SELECT TO tpay_data_broker_runtime
  USING (
    tenant_id=current_setting('tpay.tenant_id',true)
    AND organization_id IS NOT DISTINCT FROM NULLIF(current_setting('tpay.organization_id',true),'')
    AND record_id=current_setting('tpay.record_id',true)
    AND compartment_id=current_setting('tpay.compartment_id',true)
    AND actor_id=current_setting('tpay.actor_id',true)
    AND actor_kind=current_setting('tpay.actor_kind',true)
    AND permission='decrypt'
    AND purpose_code=current_setting('tpay.purpose_code',true)
    AND revoked_at IS NULL
    AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())
    AND current_setting('tpay.security_plane',true) IN ('USER','ORGANIZATION','SERVICE')
  );

DROP POLICY IF EXISTS p059_broker_grant_consume ON tpay_data_record_grants;
CREATE POLICY p059_broker_grant_consume ON tpay_data_record_grants AS RESTRICTIVE
  FOR UPDATE TO tpay_data_broker_runtime
  USING (
    tenant_id=current_setting('tpay.tenant_id',true)
    AND organization_id IS NOT DISTINCT FROM NULLIF(current_setting('tpay.organization_id',true),'')
    AND id=current_setting('tpay.grant_id',true)
    AND record_id=current_setting('tpay.record_id',true)
    AND compartment_id=current_setting('tpay.compartment_id',true)
    AND actor_id=current_setting('tpay.actor_id',true)
    AND actor_kind=current_setting('tpay.actor_kind',true)
    AND permission='decrypt'
    AND purpose_code=current_setting('tpay.purpose_code',true)
    AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())
    AND revoked_at IS NULL
    AND (max_uses IS NULL OR uses_count<max_uses)
    AND current_setting('tpay.security_plane',true) IN ('USER','ORGANIZATION','SERVICE')
  )
  WITH CHECK (
    tenant_id=current_setting('tpay.tenant_id',true)
    AND organization_id IS NOT DISTINCT FROM NULLIF(current_setting('tpay.organization_id',true),'')
    AND id=current_setting('tpay.grant_id',true)
    AND record_id=current_setting('tpay.record_id',true)
    AND compartment_id=current_setting('tpay.compartment_id',true)
    AND actor_id=current_setting('tpay.actor_id',true)
    AND actor_kind=current_setting('tpay.actor_kind',true)
    AND permission='decrypt'
    AND purpose_code=current_setting('tpay.purpose_code',true)
    AND (max_uses IS NULL OR uses_count<=max_uses)
  );

DROP POLICY IF EXISTS p059_broker_record_select ON tpay_data_records;
CREATE POLICY p059_broker_record_select ON tpay_data_records AS RESTRICTIVE
  FOR SELECT TO tpay_data_broker_runtime
  USING (
    tenant_id=current_setting('tpay.tenant_id',true)
    AND organization_id IS NOT DISTINCT FROM NULLIF(current_setting('tpay.organization_id',true),'')
    AND id=current_setting('tpay.record_id',true)
    AND compartment_id=current_setting('tpay.compartment_id',true)
    AND record_state='active'
    AND EXISTS (
      SELECT 1 FROM tpay_data_compartments c
      WHERE c.tenant_id=tpay_data_records.tenant_id
        AND c.id=tpay_data_records.compartment_id
        AND c.organization_id IS NOT DISTINCT FROM NULLIF(current_setting('tpay.organization_id',true),'')
        AND c.subject_ref=current_setting('tpay.subject_ref',true)
        AND c.module_code=current_setting('tpay.module_code',true)
        AND c.data_class=current_setting('tpay.data_class',true)
        AND c.vault_id=current_setting('tpay.vault_id',true)
        AND c.status='active'
    )
    AND EXISTS (
      SELECT 1 FROM tpay_data_record_grants g
      WHERE g.id=current_setting('tpay.grant_id',true)
        AND g.tenant_id=tpay_data_records.tenant_id
        AND g.record_id=tpay_data_records.id
        AND g.compartment_id=tpay_data_records.compartment_id
        AND g.actor_id=current_setting('tpay.actor_id',true)
        AND g.actor_kind=current_setting('tpay.actor_kind',true)
        AND g.permission='decrypt'
        AND g.purpose_code=current_setting('tpay.purpose_code',true)
    )
    AND current_setting('tpay.security_plane',true) IN ('USER','ORGANIZATION','SERVICE')
  );

DROP POLICY IF EXISTS p059_broker_key_version_select ON tpay_data_compartment_key_versions;
CREATE POLICY p059_broker_key_version_select ON tpay_data_compartment_key_versions AS RESTRICTIVE
  FOR SELECT TO tpay_data_broker_runtime
  USING (
    tenant_id=current_setting('tpay.tenant_id',true)
    AND compartment_id=current_setting('tpay.compartment_id',true)
    AND status IN ('active','retiring')
    AND EXISTS (
      SELECT 1 FROM tpay_data_records r
      WHERE r.tenant_id=tpay_data_compartment_key_versions.tenant_id
        AND r.compartment_id=tpay_data_compartment_key_versions.compartment_id
        AND r.id=current_setting('tpay.record_id',true)
    )
    AND current_setting('tpay.security_plane',true) IN ('USER','ORGANIZATION','SERVICE')
  );

DROP POLICY IF EXISTS p059_broker_audit_insert ON tpay_data_access_audit;
CREATE POLICY p059_broker_audit_insert ON tpay_data_access_audit AS RESTRICTIVE
  FOR INSERT TO tpay_data_broker_runtime
  WITH CHECK (
    tenant_id=current_setting('tpay.tenant_id',true)
    AND organization_id IS NOT DISTINCT FROM NULLIF(current_setting('tpay.organization_id',true),'')
    AND compartment_id=current_setting('tpay.compartment_id',true)
    AND record_id=current_setting('tpay.record_id',true)
    AND actor_id=current_setting('tpay.actor_id',true)
    AND actor_kind=current_setting('tpay.actor_kind',true)
    AND current_setting('tpay.security_plane',true) IN ('USER','ORGANIZATION','SERVICE')
  );

-- Runtime login membership is provisioned separately. Never grant this role
-- to Super Admin or a general application login.
