-- Tontine durability / reconciliation gate.
-- This migration adds database-level exclusivity and callback deduplication.
-- It does not create or mutate the Financial Core ledger.

ALTER TABLE tontine_beneficiary_slots
  ADD CONSTRAINT tontine_beneficiary_slots_group_cycle_unique
  UNIQUE (group_id, cycle_number);

CREATE INDEX IF NOT EXISTS idx_tontine_beneficiary_slots_claim
  ON tontine_beneficiary_slots (organization_id, group_id, cycle_number, status);

CREATE TABLE IF NOT EXISTS tontine_provider_callback_receipts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  payload_sha256 text NOT NULL,
  signature_verified boolean NOT NULL,
  received_at timestamptz NOT NULL,
  processed_at timestamptz,
  state text NOT NULL CHECK (state IN ('received','processed','rejected','replayed')),
  payout_id uuid,
  provider_reference text,
  amount_minor numeric(38,0),
  currency char(3),
  failure_code text,
  UNIQUE (organization_id, provider, provider_event_id),
  UNIQUE (organization_id, provider, payload_sha256)
);

CREATE INDEX IF NOT EXISTS idx_tontine_callback_receipts_payout
  ON tontine_provider_callback_receipts (organization_id, payout_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_tontine_callback_receipts_unprocessed
  ON tontine_provider_callback_receipts (organization_id, received_at)
  WHERE state = 'received';

COMMENT ON TABLE tontine_provider_callback_receipts IS
  'Durable provider callback barrier for independent tontine payout settlement. Financial Core remains ledger authority.';
