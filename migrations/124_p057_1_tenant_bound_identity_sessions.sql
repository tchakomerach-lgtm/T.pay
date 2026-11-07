-- P057.1 — bind persisted devices and sessions to a verified tenant context.
ALTER TABLE api_devices ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE api_sessions ADD COLUMN IF NOT EXISTS tenant_id text;

-- Backfill only from the authoritative actor/organization relation.
UPDATE api_devices d
   SET tenant_id = a.tenant_id,
       organization_id = COALESCE(d.organization_id,NULLIF(a.organization_id,'')::uuid)
  FROM education_actors a
 WHERE d.actor_id::text = a.actor_id
   AND (d.organization_id IS NULL OR d.organization_id::text = a.organization_id)
   AND d.tenant_id IS NULL;

UPDATE api_sessions s
   SET tenant_id = d.tenant_id
  FROM api_devices d
 WHERE s.device_id = d.id
   AND s.tenant_id IS NULL
   AND d.tenant_id IS NOT NULL;

-- Unresolvable legacy sessions are revoked; no tenant is guessed.
UPDATE api_sessions
   SET status='revoked', revoked_at=COALESCE(revoked_at,now())
 WHERE tenant_id IS NULL AND status='active';

ALTER TABLE api_devices
  ADD CONSTRAINT api_devices_tenant_id_format_check
  CHECK (tenant_id IS NULL OR length(btrim(tenant_id)) BETWEEN 1 AND 128);
ALTER TABLE api_sessions
  ADD CONSTRAINT api_sessions_tenant_id_format_check
  CHECK (tenant_id IS NULL OR length(btrim(tenant_id)) BETWEEN 1 AND 128);

CREATE INDEX IF NOT EXISTS idx_api_devices_tenant_actor_status
  ON api_devices(tenant_id,organization_id,actor_id,status);
CREATE INDEX IF NOT EXISTS idx_api_sessions_tenant_actor_status
  ON api_sessions(tenant_id,organization_id,actor_id,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_api_sessions_tenant_device
  ON api_sessions(tenant_id,device_id,status);

COMMENT ON COLUMN api_devices.tenant_id IS
  'P057.1 tenant binding. New device registrations require a non-empty tenant; NULL is legacy-only and cannot authenticate.';
COMMENT ON COLUMN api_sessions.tenant_id IS
  'P057.1 tenant binding. Session bearer uses tpay1.<tenantId>.<secret>; NULL legacy sessions are revoked and cannot authenticate.';
