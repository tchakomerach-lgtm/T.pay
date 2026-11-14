-- Restore the Fortress relational foundation required by migrations 054-056.
-- Vault payloads and key material remain outside PostgreSQL; this table stores metadata only.
CREATE TABLE IF NOT EXISTS fortress_vaults (
  vault_id text PRIMARY KEY,
  vault_type text NOT NULL CHECK (vault_type IN ('root','general','administrator','primary','sub')),
  parent_vault_id text,
  vault_scope text NOT NULL CHECK (vault_scope IN ('system','tenant-user','global-admin-user')),
  organization_id text,
  owner_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (vault_scope = 'system' AND owner_user_id IS NULL)
    OR (vault_scope IN ('tenant-user','global-admin-user') AND owner_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS fortress_vaults_org_scope_idx
  ON fortress_vaults(organization_id, vault_scope);
CREATE INDEX IF NOT EXISTS fortress_vaults_owner_scope_idx
  ON fortress_vaults(organization_id, owner_user_id)
  WHERE owner_user_id IS NOT NULL;

ALTER TABLE fortress_vaults ENABLE ROW LEVEL SECURITY;

-- Context accessors deliberately read transaction-local/session settings only.
-- They do not grant access; RLS policies and the authenticated DB role remain authoritative.
CREATE OR REPLACE FUNCTION public.tpay_current_organization_id()
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT NULLIF(current_setting('tpay.organization_id', true), '')
$function$;

CREATE OR REPLACE FUNCTION public.tpay_current_actor_id()
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT NULLIF(current_setting('tpay.actor_id', true), '')
$function$;

COMMENT ON TABLE fortress_vaults IS
  'Fortress vault metadata only. Encryption keys and plaintext payloads are managed outside PostgreSQL.';
COMMENT ON FUNCTION public.tpay_current_organization_id() IS
  'Returns the transaction-scoped organization context; grants no authorization by itself.';
COMMENT ON FUNCTION public.tpay_current_actor_id() IS
  'Returns the transaction-scoped actor context; grants no authorization by itself.';
