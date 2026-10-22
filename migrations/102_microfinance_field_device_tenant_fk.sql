-- Bind field-agent device mappings to the same organization as the trusted device.
-- Additive follow-up migration: do not rewrite migration 101 after deployment.
CREATE UNIQUE INDEX IF NOT EXISTS ux_api_devices_organization_device
  ON api_devices (organization_id, id);

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_field_agent_bindings_org_device_fk'
      AND conrelid = 'customer_field_agent_bindings'::regclass
  ) THEN
    ALTER TABLE customer_field_agent_bindings
      ADD CONSTRAINT customer_field_agent_bindings_org_device_fk
      FOREIGN KEY (organization_id, device_id)
      REFERENCES api_devices (organization_id, id);
  END IF;
END
$migration$;
