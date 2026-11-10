-- P057-Security: isolate the Super Admin control plane from user/org sessions.
-- The dedicated NOLOGIN role is assumed only by a separately provisioned admin API
-- database login. Never grant this role to the ordinary User Plane DB login.

DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tpay_admin_runtime') THEN
    CREATE ROLE tpay_admin_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
END
$role$;
ALTER ROLE tpay_admin_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;

ALTER TABLE tpay_vaults
  DROP CONSTRAINT IF EXISTS tpay_vaults_vault_class_check;
ALTER TABLE tpay_vaults
  ADD CONSTRAINT tpay_vaults_vault_class_check
  CHECK (vault_class IN (
    'general','administrator','finance','identity','ai','organization',
    'data_rag','document','social','offline_field','audit_evidence',
    'user_module','super_admin'
  ));

ALTER TABLE tpay_vaults
  ADD CONSTRAINT tpay_vaults_parent_same_tenant_fk
  FOREIGN KEY (tenant_id,parent_vault_id)
  REFERENCES tpay_vaults(tenant_id,id)
  ON DELETE RESTRICT;

ALTER TABLE tpay_vaults
  ADD CONSTRAINT tpay_super_admin_vault_platform_scope
  CHECK (
    vault_class <> 'super_admin'
    OR (
      tenant_id = '__platform__'
      AND organization_id IS NULL
      AND owner_actor_id IS NULL
      AND module_code = 'super-admin'
      AND parent_vault_id IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION tpay_validate_super_admin_vault_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  parent_class text;
BEGIN
  IF NEW.vault_class <> 'super_admin' THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('tpay.tenant_id', NEW.tenant_id, true);
  PERFORM set_config('tpay.vault_id', NEW.parent_vault_id::text, true);
  SELECT v.vault_class INTO parent_class
  FROM public.tpay_vaults v
  WHERE v.id = NEW.parent_vault_id
    AND v.tenant_id = NEW.tenant_id;
  IF parent_class IS DISTINCT FROM 'administrator' THEN
    RAISE EXCEPTION 'TPAY_SUPER_ADMIN_PARENT_MUST_BE_ADMINISTRATOR_VAULT';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS tpay_super_admin_vault_parent_guard ON tpay_vaults;
CREATE TRIGGER tpay_super_admin_vault_parent_guard
BEFORE INSERT OR UPDATE OF vault_class,parent_vault_id,tenant_id,organization_id,owner_actor_id,module_code
ON tpay_vaults
FOR EACH ROW EXECUTE FUNCTION tpay_validate_super_admin_vault_parent();

-- Admin vault reads require a live, exact-vault grant and an independently
-- resolved privileged-session context. The SECURITY DEFINER function runs with
-- row_security=off so the grant lookup cannot recurse through the vault policies.
CREATE OR REPLACE FUNCTION tpay_admin_vault_grant_active(p_vault_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $function$
  SELECT
    current_setting('role', true) = 'tpay_admin_runtime'
    AND current_setting('tpay.tenant_id', true) = '__platform__'
    AND current_setting('tpay.vault_id', true) = p_vault_id::text
    AND nullif(current_setting('tpay.privileged_session_id', true), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.tpay_vault_access_grants g
      WHERE g.vault_id = p_vault_id
        AND g.actor_id::text = current_setting('tpay.actor_id', true)
        AND g.permission = current_setting('tpay.permission', true)
        AND g.revoked_at IS NULL
        AND g.valid_from <= now()
        AND (g.valid_until IS NULL OR g.valid_until > now())
    )
$function$;
REVOKE ALL ON FUNCTION tpay_admin_vault_grant_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tpay_admin_vault_grant_active(uuid) TO tpay_admin_runtime;

-- Replace permissive policies rather than adding a second policy: PostgreSQL ORs
-- permissive policies, which could otherwise reopen the old user-context path.
DROP POLICY IF EXISTS tpay_vaults_explicit_scope ON tpay_vaults;
CREATE POLICY tpay_vaults_explicit_scope ON tpay_vaults
USING (
  (
    vault_class = 'super_admin'
    AND current_user = 'tpay_admin_runtime'
    AND tenant_id = '__platform__'
    AND current_setting('tpay.tenant_id', true) = '__platform__'
    AND current_setting('tpay.vault_id', true) = id::text
    AND tpay_admin_vault_grant_active(id)
  )
  OR
  (
    vault_class <> 'super_admin'
    AND current_user <> 'tpay_admin_runtime'
    AND tenant_id = current_setting('tpay.tenant_id', true)
    AND current_setting('tpay.vault_id', true) = id::text
  )
)
WITH CHECK (
  (
    vault_class = 'super_admin'
    AND current_user = 'tpay_admin_runtime'
    AND tenant_id = '__platform__'
    AND current_setting('tpay.tenant_id', true) = '__platform__'
    AND current_setting('tpay.vault_id', true) = id::text
  )
  OR
  (
    vault_class <> 'super_admin'
    AND current_user <> 'tpay_admin_runtime'
    AND tenant_id = current_setting('tpay.tenant_id', true)
    AND current_setting('tpay.vault_id', true) = id::text
  )
);

DROP POLICY IF EXISTS tpay_vault_keys_explicit_scope ON tpay_vault_keys;
CREATE POLICY tpay_vault_keys_explicit_scope ON tpay_vault_keys
USING (EXISTS (
  SELECT 1 FROM tpay_vaults v
  WHERE v.id = vault_id AND (
    (v.vault_class = 'super_admin' AND current_user = 'tpay_admin_runtime'
      AND v.tenant_id = '__platform__'
      AND current_setting('tpay.tenant_id', true) = '__platform__'
      AND current_setting('tpay.vault_id', true) = v.id::text
      AND tpay_admin_vault_grant_active(v.id))
    OR
    (v.vault_class <> 'super_admin' AND current_user <> 'tpay_admin_runtime'
      AND v.tenant_id = current_setting('tpay.tenant_id', true)
      AND current_setting('tpay.vault_id', true) = v.id::text)
  )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM tpay_vaults v
  WHERE v.id = vault_id AND (
    (v.vault_class = 'super_admin' AND current_user = 'tpay_admin_runtime'
      AND v.tenant_id = '__platform__'
      AND current_setting('tpay.tenant_id', true) = '__platform__'
      AND current_setting('tpay.vault_id', true) = v.id::text)
    OR
    (v.vault_class <> 'super_admin' AND current_user <> 'tpay_admin_runtime'
      AND v.tenant_id = current_setting('tpay.tenant_id', true)
      AND current_setting('tpay.vault_id', true) = v.id::text)
  )
));

DROP POLICY IF EXISTS tpay_vault_objects_explicit_scope ON tpay_vault_objects;
CREATE POLICY tpay_vault_objects_explicit_scope ON tpay_vault_objects
USING (EXISTS (
  SELECT 1 FROM tpay_vaults v
  WHERE v.id = vault_id AND (
    (v.vault_class = 'super_admin' AND current_user = 'tpay_admin_runtime'
      AND v.tenant_id = '__platform__'
      AND current_setting('tpay.tenant_id', true) = '__platform__'
      AND current_setting('tpay.vault_id', true) = v.id::text)
    OR
    (v.vault_class <> 'super_admin' AND current_user <> 'tpay_admin_runtime'
      AND v.tenant_id = current_setting('tpay.tenant_id', true)
      AND current_setting('tpay.vault_id', true) = v.id::text)
  )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM tpay_vaults v
  WHERE v.id = vault_id AND (
    (v.vault_class = 'super_admin' AND current_user = 'tpay_admin_runtime'
      AND v.tenant_id = '__platform__'
      AND current_setting('tpay.tenant_id', true) = '__platform__'
      AND current_setting('tpay.vault_id', true) = v.id::text)
    OR
    (v.vault_class <> 'super_admin' AND current_user <> 'tpay_admin_runtime'
      AND v.tenant_id = current_setting('tpay.tenant_id', true)
      AND current_setting('tpay.vault_id', true) = v.id::text)
  )
));

DROP POLICY IF EXISTS tpay_vault_access_explicit_scope ON tpay_vault_access_grants;
CREATE POLICY tpay_vault_access_explicit_scope ON tpay_vault_access_grants
USING (EXISTS (
  SELECT 1 FROM tpay_vaults v
  WHERE v.id = vault_id AND (
    (v.vault_class = 'super_admin' AND current_user = 'tpay_admin_runtime'
      AND v.tenant_id = '__platform__'
      AND current_setting('tpay.tenant_id', true) = '__platform__'
      AND current_setting('tpay.vault_id', true) = v.id::text)
    OR
    (v.vault_class <> 'super_admin' AND current_user <> 'tpay_admin_runtime'
      AND v.tenant_id = current_setting('tpay.tenant_id', true)
      AND current_setting('tpay.vault_id', true) = v.id::text)
  )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM tpay_vaults v
  WHERE v.id = vault_id AND (
    (v.vault_class = 'super_admin' AND current_user = 'tpay_admin_runtime'
      AND v.tenant_id = '__platform__'
      AND current_setting('tpay.tenant_id', true) = '__platform__'
      AND current_setting('tpay.vault_id', true) = v.id::text)
    OR
    (v.vault_class <> 'super_admin' AND current_user <> 'tpay_admin_runtime'
      AND v.tenant_id = current_setting('tpay.tenant_id', true)
      AND current_setting('tpay.vault_id', true) = v.id::text)
  )
));

DROP POLICY IF EXISTS tpay_vault_audit_explicit_scope ON tpay_vault_audit;
CREATE POLICY tpay_vault_audit_explicit_scope ON tpay_vault_audit
USING (
  (
    current_user = 'tpay_admin_runtime'
    AND tenant_id = '__platform__'
    AND current_setting('tpay.tenant_id', true) = '__platform__'
    AND current_setting('tpay.vault_id', true) = vault_id::text
    AND EXISTS (SELECT 1 FROM tpay_vaults v WHERE v.id = vault_id AND v.vault_class = 'super_admin')
    AND tpay_admin_vault_grant_active(vault_id)
  )
  OR
  (
    current_user <> 'tpay_admin_runtime'
    AND tenant_id = current_setting('tpay.tenant_id', true)
    AND current_setting('tpay.vault_id', true) = vault_id::text
    AND EXISTS (SELECT 1 FROM tpay_vaults v WHERE v.id = vault_id AND v.vault_class <> 'super_admin')
  )
)
WITH CHECK (
  (
    current_user = 'tpay_admin_runtime'
    AND tenant_id = '__platform__'
    AND current_setting('tpay.tenant_id', true) = '__platform__'
    AND current_setting('tpay.vault_id', true) = vault_id::text
    AND EXISTS (SELECT 1 FROM tpay_vaults v WHERE v.id = vault_id AND v.vault_class = 'super_admin')
  )
  OR
  (
    current_user <> 'tpay_admin_runtime'
    AND tenant_id = current_setting('tpay.tenant_id', true)
    AND current_setting('tpay.vault_id', true) = vault_id::text
    AND EXISTS (SELECT 1 FROM tpay_vaults v WHERE v.id = vault_id AND v.vault_class <> 'super_admin')
  )
);

-- A dedicated DB role is an additional boundary; provision a distinct login
-- and grant membership only to the isolated Admin Control Plane service.
GRANT USAGE ON SCHEMA public TO tpay_admin_runtime;
GRANT SELECT, INSERT, UPDATE ON tpay_vaults,tpay_vault_keys,tpay_vault_objects,tpay_vault_access_grants TO tpay_admin_runtime;
GRANT EXECUTE ON FUNCTION tpay_admin_vault_grant_active(uuid) TO tpay_admin_runtime;
GRANT SELECT, INSERT ON tpay_vault_audit TO tpay_admin_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON tpay_vault_audit FROM PUBLIC,tpay_admin_runtime;

CREATE OR REPLACE FUNCTION tpay_vault_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'TPAY_VAULT_AUDIT_APPEND_ONLY';
END
$function$;

DROP TRIGGER IF EXISTS tpay_vault_audit_no_mutation ON tpay_vault_audit;
CREATE TRIGGER tpay_vault_audit_no_mutation
BEFORE UPDATE OR DELETE ON tpay_vault_audit
FOR EACH ROW EXECUTE FUNCTION tpay_vault_audit_append_only();

COMMENT ON ROLE tpay_admin_runtime IS
'NOLOGIN control-plane role. Only a separately provisioned Admin API login may SET ROLE to it; never grant membership to the ordinary User Plane login.';
COMMENT ON TABLE tpay_vaults IS
'Fortress vault registry. super_admin vaults are platform-scoped and visible only through tpay_admin_runtime; no user/org session inheritance.';
