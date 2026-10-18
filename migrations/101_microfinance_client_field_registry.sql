-- Microfinance field registry: institution-owned customer locations, routes and handover proposals.
-- This migration stores operational metadata only; it does not create or mutate financial balances.

CREATE TABLE IF NOT EXISTS customer_field_profiles (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  customer_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  preferred_window_start_minute smallint,
  preferred_window_end_minute smallint,
  route_id uuid,
  last_visited_at timestamptz,
  open_exception boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, customer_id),
  CHECK (
    (preferred_window_start_minute IS NULL AND preferred_window_end_minute IS NULL)
    OR (
      preferred_window_start_minute IS NOT NULL
      AND preferred_window_end_minute IS NOT NULL
      AND preferred_window_start_minute BETWEEN 0 AND 1439
      AND preferred_window_end_minute BETWEEN 1 AND 1440
      AND preferred_window_end_minute > preferred_window_start_minute
    )
  )
);

CREATE TABLE IF NOT EXISTS customer_field_locations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters numeric(8,2) NOT NULL CHECK (accuracy_meters >= 0),
  capture_method text NOT NULL CHECK (capture_method IN ('gps','map_pin','verified_address')),
  consent_recorded boolean NOT NULL,
  address_label text,
  landmark text,
  reference_photo_id text,
  location_status text NOT NULL CHECK (location_status IN ('captured','needs_review','verified','stale','moved')),
  captured_at timestamptz NOT NULL,
  verified_by uuid,
  verified_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, customer_id)
    REFERENCES customer_field_profiles (organization_id, customer_id),
  CHECK (consent_recorded OR location_status <> 'verified'),
  CHECK ((verified_by IS NULL) = (verified_at IS NULL)),
  CHECK (location_status <> 'verified' OR (
    consent_recorded
    AND accuracy_meters <= 100
    AND verified_by IS NOT NULL
    AND verified_at IS NOT NULL
    AND verified_at >= captured_at
  ))
);

CREATE INDEX IF NOT EXISTS idx_customer_field_location_latest
  ON customer_field_locations (organization_id, customer_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_field_location_status
  ON customer_field_locations (organization_id, location_status);

CREATE TABLE IF NOT EXISTS customer_field_routes (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  route_id uuid NOT NULL,
  route_code text NOT NULL,
  name text NOT NULL,
  zone_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','active','paused','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, route_id),
  UNIQUE (organization_id, route_code)
);

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_field_profiles_route_fk'
      AND conrelid = 'customer_field_profiles'::regclass
  ) THEN
    ALTER TABLE customer_field_profiles
      ADD CONSTRAINT customer_field_profiles_route_fk
      FOREIGN KEY (organization_id, route_id)
      REFERENCES customer_field_routes (organization_id, route_id);
  END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS customer_field_assignments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  route_id uuid,
  agent_id uuid NOT NULL,
  assignment_role text NOT NULL CHECK (assignment_role IN ('primary','secondary','emergency')),
  status text NOT NULL CHECK (status IN ('proposed','active','suspended','ended')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  proposed_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  plan_hash char(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, customer_id)
    REFERENCES customer_field_profiles (organization_id, customer_id),
  FOREIGN KEY (organization_id, route_id)
    REFERENCES customer_field_routes (organization_id, route_id),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK ((status <> 'active') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (approved_by IS NULL OR approved_by <> proposed_by)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_field_one_active_primary
  ON customer_field_assignments (organization_id, customer_id)
  WHERE assignment_role = 'primary' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_customer_field_assignments_agent
  ON customer_field_assignments (organization_id, agent_id, status);

CREATE TABLE IF NOT EXISTS customer_field_visit_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  route_id uuid,
  agent_id uuid NOT NULL,
  device_id uuid NOT NULL,
  visit_status text NOT NULL CHECK (visit_status IN (
    'started','arrived','customer_confirmed','completed','customer_absent',
    'location_mismatch','rescheduled','disputed','failed'
  )),
  event_sequence bigint NOT NULL CHECK (event_sequence > 0),
  idempotency_key text NOT NULL,
  event_at timestamptz NOT NULL,
  latitude numeric(9,6),
  longitude numeric(9,6),
  accuracy_meters numeric(8,2),
  evidence_hash char(64),
  correlation_id uuid NOT NULL,
  FOREIGN KEY (organization_id, customer_id)
    REFERENCES customer_field_profiles (organization_id, customer_id),
  FOREIGN KEY (organization_id, route_id)
    REFERENCES customer_field_routes (organization_id, route_id),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (organization_id, device_id, event_sequence),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0)
);

CREATE INDEX IF NOT EXISTS idx_customer_field_visit_timeline
  ON customer_field_visit_events (organization_id, customer_id, event_at DESC);

CREATE TABLE IF NOT EXISTS customer_field_handover_cases (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  source_agent_id uuid NOT NULL,
  target_agent_id uuid NOT NULL,
  route_id uuid,
  status text NOT NULL CHECK (status IN ('proposed','approved','applied','rejected','expired')),
  reason text NOT NULL CHECK (reason IN ('agent_unavailable','coverage_gap','route_rebalance','device_lost')),
  plan_hash char(64) NOT NULL,
  plan_expires_at timestamptz NOT NULL,
  proposed_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, route_id)
    REFERENCES customer_field_routes (organization_id, route_id),
  CHECK (approved_by IS NULL OR approved_by <> proposed_by),
  CHECK ((status NOT IN ('approved','applied')) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (status <> 'applied' OR applied_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS customer_field_handover_items (
  organization_id uuid NOT NULL,
  handover_id uuid NOT NULL REFERENCES customer_field_handover_cases(id),
  customer_id uuid NOT NULL,
  previous_agent_id uuid,
  next_agent_id uuid NOT NULL,
  distance_km numeric(9,3) NOT NULL CHECK (distance_km >= 0),
  item_plan_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, handover_id, customer_id),
  FOREIGN KEY (organization_id, customer_id)
    REFERENCES customer_field_profiles (organization_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_field_handover_pending
  ON customer_field_handover_cases (organization_id, status, plan_expires_at);
