-- Preserve device-binding history while allowing a revoked actor/device binding to be re-enrolled.
-- Existing API lookups remain keyed by organization_id, actor_id and device_id.
ALTER TABLE customer_field_agent_bindings
  ADD COLUMN IF NOT EXISTS binding_id uuid DEFAULT gen_random_uuid();

UPDATE customer_field_agent_bindings
SET binding_id = gen_random_uuid()
WHERE binding_id IS NULL;

ALTER TABLE customer_field_agent_bindings
  ALTER COLUMN binding_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN binding_id SET NOT NULL;

DO $migration$
DECLARE
  pk_name text;
  pk_columns text[];
BEGIN
  SELECT c.conname, array_agg(a.attname ORDER BY k.ordinality)
    INTO pk_name, pk_columns
  FROM pg_constraint c
  JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid AND a.attnum = k.attnum
  WHERE c.conrelid = 'customer_field_agent_bindings'::regclass
    AND c.contype = 'p'
  GROUP BY c.conname;

  IF pk_name IS NOT NULL AND pk_columns IS DISTINCT FROM ARRAY['binding_id']::text[] THEN
    EXECUTE format('ALTER TABLE customer_field_agent_bindings DROP CONSTRAINT %I', pk_name);
    pk_name := NULL;
  END IF;

  IF pk_name IS NULL THEN
    ALTER TABLE customer_field_agent_bindings
      ADD CONSTRAINT customer_field_agent_bindings_pkey PRIMARY KEY (binding_id);
  END IF;
END
$migration$;

-- At most one current binding for a given actor and trusted device in one tenant.
-- Revoked rows remain as an audit trail and no longer block a new enrollment.
CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_field_agent_binding_active
  ON customer_field_agent_bindings (organization_id, actor_id, device_id)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_customer_field_agent_binding_history
  ON customer_field_agent_bindings (organization_id, actor_id, device_id, bound_at DESC);
