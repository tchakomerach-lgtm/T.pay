-- P056.3.1 — preserve revocation actor and reason without deleting grant history.
ALTER TABLE api_actor_permissions
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS revocation_reason text;

ALTER TABLE api_actor_permissions
  DROP CONSTRAINT IF EXISTS api_actor_permissions_revocation_reason_check,
  ADD CONSTRAINT api_actor_permissions_revocation_reason_check
    CHECK (revocation_reason IS NULL OR length(btrim(revocation_reason)) BETWEEN 1 AND 500);

CREATE INDEX IF NOT EXISTS api_actor_permissions_revoked_history
  ON api_actor_permissions (tenant_id, organization_id, revoked_at DESC)
  WHERE revoked_at IS NOT NULL;

-- The session contract currently carries organization but not tenant. Until P057
-- adds a verified tenant claim, runtime actor reads are narrowly constrained by
-- explicit tenant_id + organization_id predicates in the API query.
GRANT SELECT ON education_actors TO tpay_school_runtime;

-- RLS is ENABLED and FORCED by migration 120. Runtime has no DELETE grant.
GRANT SELECT, INSERT, UPDATE ON api_actor_permissions TO tpay_school_runtime;
