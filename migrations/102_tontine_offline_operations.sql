-- Offline field queue is an operational inbox, not a financial ledger.
CREATE TABLE IF NOT EXISTS tontine_offline_operations (
  operation_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  device_id text NOT NULL,
  sequence bigint NOT NULL,
  kind text NOT NULL CHECK (kind IN ('contribution_intent','collection_receipt','beneficiary_ack')),
  idempotency_key text NOT NULL,
  payload_json jsonb NOT NULL,
  captured_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  signature text NOT NULL,
  state text NOT NULL CHECK (state IN ('captured','queued','accepted','rejected','needs_review','reconciled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, device_id, sequence),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_tontine_offline_sync
  ON tontine_offline_operations (organization_id, device_id, sequence);

CREATE INDEX IF NOT EXISTS idx_tontine_offline_state
  ON tontine_offline_operations (organization_id, state, captured_at);

COMMENT ON TABLE tontine_offline_operations IS
  'Signed field operations awaiting reconciliation. Never a substitute for Financial Core ledger state.';
