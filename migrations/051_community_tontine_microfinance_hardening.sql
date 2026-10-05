-- Community Tontine / Microfinance operational hardening.
-- This migration adds idempotency and audit correlation only; it never creates ledger state.

ALTER TABLE community_tontine_mf_access
  ADD COLUMN IF NOT EXISTS access_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_modified_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE community_tontine_mf_reconciliation
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS last_modified_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_community_tontine_mf_reconciliation_idempotency
  ON community_tontine_mf_reconciliation (organization_id, microfinance_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_tontine_mf_access_expiry
  ON community_tontine_mf_access (organization_id, microfinance_id, expires_at)
  WHERE status='active';

CREATE INDEX IF NOT EXISTS idx_community_tontine_mf_reconciliation_age
  ON community_tontine_mf_reconciliation (organization_id, microfinance_id, state, opened_at);

COMMENT ON COLUMN community_tontine_mf_reconciliation.idempotency_key IS
  'Stable partner-operation key. Reusing a key must represent the same logical reconciliation operation.';
