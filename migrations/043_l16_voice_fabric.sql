-- L16 / Prompt 020 — Voice Fabric persistence.
-- Financial state remains outside this migration and is owned by Financial Core.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS voice_sessions (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  actor_id text,
  channel text NOT NULL CHECK (channel IN ('pstn','sip','webrtc','mobile','web')),
  state text NOT NULL CHECK (state IN (
    'RINGING','ACCEPTED','CONSENT_CHECK','IDENTIFICATION','TRUST_SCORING',
    'INTENT_CAPTURE','POLICY_CHECK','TOOL_PLAN','USER_CONFIRMATION',
    'STEP_UP_AUTH','HUMAN_APPROVAL','EXECUTION','RESULT_CONFIRMATION',
    'HANDOFF','RESTRICTED','CONTAINED','ENDED'
  )),
  risk_level text NOT NULL CHECK (risk_level IN ('V0','V1','V2','V3','V4','V5')),
  capability_lease_id text NOT NULL UNIQUE,
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > started_at)
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_org_started
  ON voice_sessions (organization_id, started_at DESC);

CREATE TABLE IF NOT EXISTS voice_capability_leases (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  session_id text NOT NULL REFERENCES voice_sessions(id),
  agent_id text NOT NULL,
  capability text NOT NULL,
  scope_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (session_id, capability),
  CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS idx_voice_capability_active
  ON voice_capability_leases (organization_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS voice_transaction_challenges (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  session_id text NOT NULL REFERENCES voice_sessions(id),
  action_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, action_hash)
);

CREATE INDEX IF NOT EXISTS idx_voice_challenge_expiry
  ON voice_transaction_challenges (organization_id, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS voice_appointments (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  resource_id text NOT NULL,
  actor_id text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('confirmed','cancelled')),
  channel text NOT NULL CHECK (channel IN ('pstn','sip','webrtc','mobile','web')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  UNIQUE (organization_id, idempotency_key),
  CHECK (ends_at > starts_at)
);

-- Database-level concurrency barrier. Two concurrent transactions cannot
-- confirm overlapping appointments for the same organization/resource.
ALTER TABLE voice_appointments
  DROP CONSTRAINT IF EXISTS voice_appointments_no_overlap;

ALTER TABLE voice_appointments
  ADD CONSTRAINT voice_appointments_no_overlap
  EXCLUDE USING gist (
    organization_id WITH =,
    resource_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status = 'confirmed');

CREATE INDEX IF NOT EXISTS idx_voice_appointments_org_time
  ON voice_appointments (organization_id, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_voice_appointments_resource_time
  ON voice_appointments (organization_id, resource_id, starts_at, ends_at)
  WHERE status = 'confirmed';

CREATE TABLE IF NOT EXISTS voice_consents (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  session_id text NOT NULL REFERENCES voice_sessions(id),
  actor_id text,
  recording_status text NOT NULL CHECK (recording_status IN ('granted','denied','not_requested')),
  transcript_status text NOT NULL CHECK (transcript_status IN ('granted','denied','not_requested')),
  captured_at timestamptz NOT NULL,
  policy_version text NOT NULL
);

CREATE TABLE IF NOT EXISTS voice_security_events (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  session_id text,
  event_type text NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('V0','V1','V2','V3','V4','V5')),
  correlation_id text NOT NULL,
  event_hash text NOT NULL,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, event_hash)
);

CREATE INDEX IF NOT EXISTS idx_voice_security_events_org_time
  ON voice_security_events (organization_id, created_at DESC);

-- Raw audio and transcripts intentionally live in a separate encrypted object
-- store/search index. This table stores metadata and retention policy only.
CREATE TABLE IF NOT EXISTS voice_media_records (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  session_id text NOT NULL REFERENCES voice_sessions(id),
  media_type text NOT NULL CHECK (media_type IN ('audio','transcript')),
  object_reference text NOT NULL,
  content_sha256 text NOT NULL,
  retention_until timestamptz,
  legal_hold boolean NOT NULL DEFAULT false,
  redacted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, content_sha256)
);

COMMENT ON TABLE voice_appointments IS
  'Voice booking state; Financial Core is authoritative for financial side effects.';
COMMENT ON CONSTRAINT voice_appointments_no_overlap ON voice_appointments IS
  'Prevents concurrent overlapping confirmed reservations for the same tenant/resource.';
