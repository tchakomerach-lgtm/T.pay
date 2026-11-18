-- First live HTTP slice for the independent Community Tontine.
-- Groups and memberships are organization-isolated at PostgreSQL level.
ALTER TABLE tontine_groups ADD COLUMN IF NOT EXISTS idempotency_key text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='tontine_groups_idempotency_key_check'
      AND conrelid='tontine_groups'::regclass
  ) THEN
    ALTER TABLE tontine_groups
      ADD CONSTRAINT tontine_groups_idempotency_key_check
      CHECK (idempotency_key IS NULL OR length(btrim(idempotency_key)) BETWEEN 12 AND 128);
  END IF;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_groups_org_idempotency
  ON tontine_groups(organization_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE tontine_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tontine_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tontine_groups_organization_scope ON tontine_groups;
CREATE POLICY tontine_groups_organization_scope ON tontine_groups
  USING (organization_id=public.tpay_current_organization_id())
  WITH CHECK (organization_id=public.tpay_current_organization_id());

ALTER TABLE tontine_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tontine_memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tontine_memberships_organization_scope ON tontine_memberships;
CREATE POLICY tontine_memberships_organization_scope ON tontine_memberships
  USING (organization_id=public.tpay_current_organization_id())
  WITH CHECK (organization_id=public.tpay_current_organization_id());

COMMENT ON POLICY tontine_groups_organization_scope ON tontine_groups IS
  'Group reads and writes are limited to the authenticated transaction-local organization context.';
COMMENT ON POLICY tontine_memberships_organization_scope ON tontine_memberships IS
  'Membership reads and writes are limited to the authenticated transaction-local organization context.';

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tontine_cycles',
    'tontine_member_schedules',
    'tontine_beneficiary_slots',
    'tontine_contributions',
    'tontine_payment_intents',
    'tontine_receipts',
    'tontine_governance_proposals',
    'tontine_governance_votes'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_organization_scope', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (organization_id=public.tpay_current_organization_id()) WITH CHECK (organization_id=public.tpay_current_organization_id())',
      table_name || '_organization_scope', table_name
    );
  END LOOP;
END;
$$;
