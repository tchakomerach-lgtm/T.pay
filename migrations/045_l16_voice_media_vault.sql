-- L16.5 — encrypted audio/transcript vault metadata and retention state.
-- Bytes live in an encrypted object store; PostgreSQL stores metadata, hashes and policy state only.
CREATE TABLE IF NOT EXISTS voice_media_vault (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  call_id text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('audio','transcript','transcript_redacted')),
  object_uri text NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  encryption_key_ref text NOT NULL,
  encryption_mode text NOT NULL CHECK (encryption_mode IN ('KMS_ENVELOPE','HSM_ENVELOPE')),
  consent_id text,
  retention_until timestamptz,
  legal_hold boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','REDACTED','QUARANTINED','PENDING_ERASURE','ERASED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  erased_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_voice_media_vault_retention
  ON voice_media_vault (organization_id, retention_until)
  WHERE legal_hold = false AND state IN ('ACTIVE','REDACTED','PENDING_ERASURE');

CREATE INDEX IF NOT EXISTS idx_voice_media_vault_call
  ON voice_media_vault (organization_id, call_id);

COMMENT ON TABLE voice_media_vault IS
  'Metadata-only vault index. Raw audio/transcript bytes are encrypted outside PostgreSQL; key material is referenced through KMS/HSM.';
