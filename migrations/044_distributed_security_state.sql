CREATE TABLE IF NOT EXISTS ai_capability_revocations (
  capability_id text PRIMARY KEY,
  revoked_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_capability_revocation_state (
  state_id smallint PRIMARY KEY CHECK (state_id = 1),
  global_revocation_epoch bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ai_capability_revocation_state (state_id, global_revocation_epoch)
VALUES (1, 0)
ON CONFLICT (state_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS security_replay_claims (
  scope text NOT NULL,
  action_id text NOT NULL,
  payload_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, action_id, payload_hash)
);

CREATE INDEX IF NOT EXISTS security_replay_claims_expiry_idx
  ON security_replay_claims (expires_at);

CREATE INDEX IF NOT EXISTS ai_capability_revocations_revoked_at_idx
  ON ai_capability_revocations (revoked_at);
