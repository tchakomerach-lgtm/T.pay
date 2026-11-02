-- P056.3 — temporal lifecycle and immutable grant history for organization permissions.
-- Existing grants are preserved as the first grant record; revocation never deletes history.

ALTER TABLE api_actor_permissions
  ADD COLUMN IF NOT EXISTS grant_id uuid,
  ADD COLUMN IF NOT EXISTS valid_from timestamptz,
  ADD COLUMN IF NOT EXISTS valid_until timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS granted_by uuid,
  ADD COLUMN IF NOT EXISTS grant_reason text;

UPDATE api_actor_permissions
   SET grant_id = COALESCE(grant_id, gen_random_uuid()),
       valid_from = COALESCE(valid_from, granted_at)
 WHERE grant_id IS NULL OR valid_from IS NULL;

ALTER TABLE api_actor_permissions
  ALTER COLUMN grant_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN grant_id SET NOT NULL,
  ALTER COLUMN valid_from SET DEFAULT now(),
  ALTER COLUMN valid_from SET NOT NULL;

ALTER TABLE api_actor_permissions
  DROP CONSTRAINT IF EXISTS api_actor_permissions_pkey;

ALTER TABLE api_actor_permissions
  ADD CONSTRAINT api_actor_permissions_pkey PRIMARY KEY (grant_id);

ALTER TABLE api_actor_permissions
  DROP CONSTRAINT IF EXISTS api_actor_permissions_valid_window_check,
  ADD CONSTRAINT api_actor_permissions_valid_window_check
    CHECK (valid_until IS NULL OR valid_until > valid_from),
  DROP CONSTRAINT IF EXISTS api_actor_permissions_revocation_check,
  ADD CONSTRAINT api_actor_permissions_revocation_check
    CHECK (revoked_at IS NULL OR revoked_at >= valid_from),
  DROP CONSTRAINT IF EXISTS api_actor_permissions_reason_check,
  ADD CONSTRAINT api_actor_permissions_reason_check
    CHECK (grant_reason IS NULL OR length(btrim(grant_reason)) BETWEEN 1 AND 500);

CREATE INDEX IF NOT EXISTS api_actor_permissions_effective_lookup
  ON api_actor_permissions (tenant_id, organization_id, actor_id, permission, valid_from, valid_until)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS api_actor_permissions_grant_history
  ON api_actor_permissions (tenant_id, organization_id, actor_id, granted_at DESC);

-- Permission reads and administrative writes use the same tenant/org runtime context as school APIs.
ALTER TABLE api_actor_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_actor_permissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_actor_permissions_runtime_scope ON api_actor_permissions;
CREATE POLICY api_actor_permissions_runtime_scope ON api_actor_permissions
  FOR ALL TO tpay_school_runtime
  USING (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
     AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
          AND organization_id = NULLIF(current_setting('tpay.organization_id', true), ''));

GRANT SELECT, INSERT, UPDATE ON api_actor_permissions TO tpay_school_runtime;
