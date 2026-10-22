-- Composite tenant and group isolation for independent Community Tontine records.
-- This migration fails closed if legacy rows violate the intended scope; remediation must be explicit.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tontine_memberships m
    LEFT JOIN tontine_groups g ON g.id=m.group_id AND g.organization_id=m.organization_id
    WHERE g.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM tontine_cycles c
    LEFT JOIN tontine_groups g ON g.id=c.group_id AND g.organization_id=c.organization_id
    WHERE g.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM tontine_member_schedules s
    LEFT JOIN tontine_cycles c ON c.id=s.cycle_id AND c.organization_id=s.organization_id
    LEFT JOIN tontine_memberships m ON m.id=s.membership_id AND m.organization_id=s.organization_id
    WHERE c.id IS NULL OR m.id IS NULL OR m.group_id<>c.group_id
  ) OR EXISTS (
    SELECT 1 FROM tontine_beneficiary_slots s
    LEFT JOIN tontine_cycles c ON c.id=s.cycle_id AND c.organization_id=s.organization_id AND c.group_id=s.group_id
    LEFT JOIN tontine_memberships m ON m.id=s.beneficiary_membership_id AND m.organization_id=s.organization_id AND m.group_id=s.group_id
    WHERE c.id IS NULL OR m.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM tontine_contributions tc
    LEFT JOIN tontine_memberships m ON m.id=tc.membership_id AND m.organization_id=tc.organization_id AND m.group_id=tc.group_id
    WHERE m.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM payout_intents pi
    JOIN tontine_beneficiary_slots s ON s.id=pi.tontine_slot_id
    JOIN tontine_memberships m ON m.id=s.beneficiary_membership_id
    WHERE pi.tontine_slot_id IS NOT NULL
      AND (s.organization_id<>pi.organization_id OR s.cycle_id::text<>pi.cycle_id
        OR m.organization_id<>pi.organization_id OR m.client_id::text<>pi.beneficiary_id
        OR pi.amount_minor<>s.amount_target_minor OR pi.currency::char(3)<>(
          SELECT g.currency FROM tontine_groups g
          WHERE g.id=s.group_id AND g.organization_id=s.organization_id
        ))
  ) THEN
    RAISE EXCEPTION 'TONTINE_TENANT_SCOPE_REMEDIATION_REQUIRED';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_groups_org_id
  ON tontine_groups (organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_memberships_org_id
  ON tontine_memberships (organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_memberships_org_group_id
  ON tontine_memberships (organization_id,group_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_cycles_org_id
  ON tontine_cycles (organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_cycles_org_group_id
  ON tontine_cycles (organization_id,group_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_beneficiary_slots_org_id
  ON tontine_beneficiary_slots (organization_id,id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_memberships_org_group_fk' AND conrelid='tontine_memberships'::regclass) THEN
    ALTER TABLE tontine_memberships ADD CONSTRAINT tontine_memberships_org_group_fk
      FOREIGN KEY (organization_id,group_id) REFERENCES tontine_groups(organization_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_cycles_org_group_fk' AND conrelid='tontine_cycles'::regclass) THEN
    ALTER TABLE tontine_cycles ADD CONSTRAINT tontine_cycles_org_group_fk
      FOREIGN KEY (organization_id,group_id) REFERENCES tontine_groups(organization_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_schedules_org_cycle_fk' AND conrelid='tontine_member_schedules'::regclass) THEN
    ALTER TABLE tontine_member_schedules ADD CONSTRAINT tontine_schedules_org_cycle_fk
      FOREIGN KEY (organization_id,cycle_id) REFERENCES tontine_cycles(organization_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_schedules_org_membership_fk' AND conrelid='tontine_member_schedules'::regclass) THEN
    ALTER TABLE tontine_member_schedules ADD CONSTRAINT tontine_schedules_org_membership_fk
      FOREIGN KEY (organization_id,membership_id) REFERENCES tontine_memberships(organization_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_contributions_org_member_group_fk' AND conrelid='tontine_contributions'::regclass) THEN
    ALTER TABLE tontine_contributions ADD CONSTRAINT tontine_contributions_org_member_group_fk
      FOREIGN KEY (organization_id,group_id,membership_id) REFERENCES tontine_memberships(organization_id,group_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_slots_org_group_cycle_fk' AND conrelid='tontine_beneficiary_slots'::regclass) THEN
    ALTER TABLE tontine_beneficiary_slots ADD CONSTRAINT tontine_slots_org_group_cycle_fk
      FOREIGN KEY (organization_id,group_id,cycle_id) REFERENCES tontine_cycles(organization_id,group_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_slots_org_group_member_fk' AND conrelid='tontine_beneficiary_slots'::regclass) THEN
    ALTER TABLE tontine_beneficiary_slots ADD CONSTRAINT tontine_slots_org_group_member_fk
      FOREIGN KEY (organization_id,group_id,beneficiary_membership_id) REFERENCES tontine_memberships(organization_id,group_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payout_intents_org_slot_fk' AND conrelid='payout_intents'::regclass) THEN
    ALTER TABLE payout_intents ADD CONSTRAINT payout_intents_org_slot_fk
      FOREIGN KEY (organization_id,tontine_slot_id) REFERENCES tontine_beneficiary_slots(organization_id,id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION guard_tontine_schedule_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tontine_cycles c
    JOIN tontine_memberships m
      ON m.id=NEW.membership_id AND m.organization_id=NEW.organization_id
     AND m.group_id=c.group_id
    WHERE c.id=NEW.cycle_id AND c.organization_id=NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'TONTINE_SCHEDULE_TENANT_OR_GROUP_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tontine_schedule_scope_guard ON tontine_member_schedules;
CREATE TRIGGER trg_tontine_schedule_scope_guard
BEFORE INSERT OR UPDATE ON tontine_member_schedules
FOR EACH ROW EXECUTE FUNCTION guard_tontine_schedule_scope();

CREATE OR REPLACE FUNCTION guard_tontine_payout_slot_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tontine_slot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM tontine_beneficiary_slots s
    JOIN tontine_memberships m
      ON m.id=s.beneficiary_membership_id AND m.organization_id=s.organization_id
     AND m.group_id=s.group_id
    JOIN tontine_cycles c
      ON c.id=s.cycle_id AND c.organization_id=s.organization_id AND c.group_id=s.group_id
    JOIN tontine_groups g
      ON g.id=s.group_id AND g.organization_id=s.organization_id
    WHERE s.id=NEW.tontine_slot_id AND s.organization_id=NEW.organization_id
      AND c.id::text=NEW.cycle_id AND m.client_id::text=NEW.beneficiary_id
      AND NEW.amount_minor=s.amount_target_minor AND NEW.currency::char(3)=g.currency
  ) THEN
    RAISE EXCEPTION 'TONTINE_PAYOUT_TENANT_OR_BENEFICIARY_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tontine_payout_slot_scope_guard ON payout_intents;
CREATE TRIGGER trg_tontine_payout_slot_scope_guard
BEFORE INSERT OR UPDATE OF organization_id,cycle_id,beneficiary_id,amount_minor,currency,tontine_slot_id
ON payout_intents
FOR EACH ROW EXECUTE FUNCTION guard_tontine_payout_slot_scope();

COMMENT ON FUNCTION guard_tontine_schedule_scope() IS
  'Prevents a schedule from joining a membership and cycle from different organizations or groups.';
COMMENT ON FUNCTION guard_tontine_payout_slot_scope() IS
  'Binds tontine payout intents to a same-tenant cycle, eligible-slot identity, beneficiary identity, amount and currency.';
