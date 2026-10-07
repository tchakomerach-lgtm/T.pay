-- P038 — Education Sync Fabric durable inbox/outbox and device cursors.
-- Financial state remains owned by Financial Core. This migration only records
-- educational synchronization envelopes, replay/idempotency barriers and events.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS education_sync_device_cursors (
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  device_id text NOT NULL,
  last_accepted_sequence bigint NOT NULL DEFAULT 0 CHECK (last_accepted_sequence >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, organization_id, device_id)
);

CREATE TABLE IF NOT EXISTS education_sync_inbox (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  event_id text NOT NULL,
  device_id text NOT NULL,
  actor_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence >= 0),
  occurred_at timestamptz NOT NULL,
  event_type text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('P0','P1','P2','P3')),
  payload jsonb NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-fA-F]{64}$'),
  idempotency_key text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version >= 1),
  state text NOT NULL CHECK (state IN ('PENDING','ACCEPTED','REJECTED','DUPLICATE','CONFLICTED','UNKNOWN')),
  rejection_code text,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, organization_id, event_id),
  UNIQUE (tenant_id, organization_id, idempotency_key),
  UNIQUE (tenant_id, organization_id, device_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_education_sync_inbox_device_sequence
  ON education_sync_inbox (tenant_id, organization_id, device_id, sequence);

CREATE INDEX IF NOT EXISTS idx_education_sync_inbox_state
  ON education_sync_inbox (tenant_id, organization_id, state, created_at);

CREATE TABLE IF NOT EXISTS education_sync_outbox (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-fA-F]{64}$'),
  dispatch_state text NOT NULL DEFAULT 'PENDING'
    CHECK (dispatch_state IN ('PENDING','CLAIMED','SENT','FAILED','UNKNOWN')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claimed_by text,
  claimed_at timestamptz,
  last_error text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (tenant_id, organization_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_education_sync_outbox_dispatch
  ON education_sync_outbox (tenant_id, organization_id, dispatch_state, created_at);
