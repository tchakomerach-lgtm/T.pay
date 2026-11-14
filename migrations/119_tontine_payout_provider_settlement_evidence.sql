-- Durable provider evidence and Financial Core settlement binding for Community Tontine payouts.
-- A payout becomes confirmed only after its Financial Core ledger transaction exists.
ALTER TABLE payout_intents
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS provider_event_id text,
  ADD COLUMN IF NOT EXISTS settlement_transaction_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='payout_intents_org_settlement_tx_fk'
      AND conrelid='payout_intents'::regclass
  ) THEN
    ALTER TABLE payout_intents
      ADD CONSTRAINT payout_intents_org_settlement_tx_fk
      FOREIGN KEY (organization_id,settlement_transaction_id)
      REFERENCES ledger_transactions(organization_id,id);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_provider_event_org
  ON payout_intents (organization_id,provider,provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tontine_payout_pending_approval
  ON payout_intents (organization_id,created_at,payout_id)
  WHERE state='pending_approval';

CREATE INDEX IF NOT EXISTS idx_tontine_payout_initiated
  ON payout_intents (organization_id,provider,created_at,payout_id)
  WHERE state='initiated';

COMMENT ON COLUMN payout_intents.settlement_transaction_id IS
  'Authoritative Financial Core Ledger transaction; never populated from a provider response alone.';
COMMENT ON COLUMN payout_intents.provider_event_id IS
  'Verified provider event identity, unique within the organization and provider.';
