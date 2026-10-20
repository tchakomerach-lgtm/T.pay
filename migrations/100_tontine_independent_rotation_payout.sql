CREATE TABLE IF NOT EXISTS tontine_groups (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  country_code char(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  contribution_mode text NOT NULL CHECK (contribution_mode IN ('fixed','variable','goal')),
  target_minor numeric(38,0) CHECK (target_minor IS NULL OR target_minor > 0),
  fixed_amount_minor numeric(38,0) CHECK (fixed_amount_minor IS NULL OR fixed_amount_minor > 0),
  minimum_amount_minor numeric(38,0) NOT NULL CHECK (minimum_amount_minor > 0),
  cycle_number integer NOT NULL DEFAULT 1 CHECK (cycle_number > 0),
  max_members integer CHECK (max_members IS NULL OR max_members >= 2),
  governance text NOT NULL CHECK (governance IN ('founder_managed','member_vote')),
  partner_microfinance_id uuid,
  status text NOT NULL CHECK (status IN ('draft','pending_review','active','paused','completed','cancelled')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS tontine_memberships (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL REFERENCES tontine_groups(id),
  client_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('founder','member','treasurer','collector','supervisor')),
  status text NOT NULL CHECK (status IN ('pending','active','suspended','exited')),
  joined_at timestamptz NOT NULL,
  exited_at timestamptz,
  selected_microfinance_id uuid,
  UNIQUE (organization_id, group_id, client_id)
);

CREATE TABLE IF NOT EXISTS tontine_cycles (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL REFERENCES tontine_groups(id),
  cycle_number integer NOT NULL CHECK (cycle_number > 0),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL CHECK (status IN ('scheduled','open','settlement_pending','closed','paused','cancelled')),
  rules_version text NOT NULL,
  minimum_amount_minor numeric(38,0) NOT NULL CHECK (minimum_amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL,
  closed_at timestamptz,
  UNIQUE (organization_id, group_id, cycle_number),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS tontine_member_schedules (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  cycle_id uuid NOT NULL REFERENCES tontine_cycles(id),
  membership_id uuid NOT NULL REFERENCES tontine_memberships(id),
  sequence integer NOT NULL CHECK (sequence > 0),
  scheduled_for date NOT NULL,
  expected_amount_minor numeric(38,0) NOT NULL CHECK (expected_amount_minor > 0),
  due_status text NOT NULL CHECK (due_status IN ('scheduled','due','pending','confirmed','missed','reversed')),
  contribution_id uuid,
  grace_until timestamptz,
  confirmed_at timestamptz,
  UNIQUE (organization_id, cycle_id, membership_id, scheduled_for)
);

CREATE TABLE IF NOT EXISTS tontine_beneficiary_slots (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  group_id uuid NOT NULL REFERENCES tontine_groups(id),
  cycle_id uuid NOT NULL REFERENCES tontine_cycles(id),
  cycle_number integer NOT NULL CHECK (cycle_number > 0),
  sequence integer NOT NULL CHECK (sequence > 0),
  beneficiary_membership_id uuid NOT NULL REFERENCES tontine_memberships(id),
  amount_target_minor numeric(38,0) NOT NULL DEFAULT 0 CHECK (amount_target_minor >= 0),
  status text NOT NULL CHECK (status IN ('scheduled','eligible','paid','deferred','blocked')),
  scheduled_for date NOT NULL,
  paid_at timestamptz,
  UNIQUE (organization_id, cycle_id, sequence),
  UNIQUE (organization_id, cycle_id, beneficiary_membership_id)
);

ALTER TABLE payout_intents
  ADD COLUMN IF NOT EXISTS tontine_slot_id uuid;

CREATE INDEX IF NOT EXISTS idx_tontine_groups_org_status
  ON tontine_groups (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_tontine_memberships_group_status
  ON tontine_memberships (organization_id, group_id, status);

CREATE INDEX IF NOT EXISTS idx_tontine_cycles_group_status
  ON tontine_cycles (organization_id, group_id, status);

CREATE INDEX IF NOT EXISTS idx_tontine_schedule_due
  ON tontine_member_schedules (organization_id, cycle_id, due_status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_tontine_beneficiary_status
  ON tontine_beneficiary_slots (organization_id, cycle_id, status);
