-- P056 — durable school transactional outbox.
-- Mutation, immutable audit record and event intent are committed by one Unit of Work.
CREATE TABLE IF NOT EXISTS education_transactional_outbox (
  outbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 120),
  entity_id text NOT NULL,
  entity_version bigint NOT NULL CHECK (entity_version > 0),
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','PROCESSING','PUBLISHED','DEAD')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  locked_by text,
  published_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, organization_id, event_id),
  CHECK ((state = 'PROCESSING') = (locked_until IS NOT NULL AND locked_by IS NOT NULL)),
  CHECK ((state = 'PUBLISHED') = (published_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_education_outbox_pending
  ON education_transactional_outbox (available_at, created_at)
  WHERE state IN ('PENDING','PROCESSING');
ALTER TABLE education_transactional_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_transactional_outbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS education_outbox_runtime_scope ON education_transactional_outbox;
CREATE POLICY education_outbox_runtime_scope ON education_transactional_outbox
  FOR ALL TO tpay_school_runtime
  USING (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('tpay.tenant_id', true), '')
    AND organization_id = NULLIF(current_setting('tpay.organization_id', true), '')
  );
GRANT SELECT, INSERT, UPDATE ON education_transactional_outbox TO tpay_school_runtime;
COMMENT ON TABLE education_transactional_outbox IS
  'Durable event intent inserted atomically with school mutation and audit; delivery is at-least-once.';
