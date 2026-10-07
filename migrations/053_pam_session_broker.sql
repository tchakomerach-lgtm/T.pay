CREATE TABLE IF NOT EXISTS tpay_pam_sessions(
 id uuid PRIMARY KEY,
 privileged_session_id uuid NOT NULL REFERENCES tpay_privileged_sessions(id),
 resource text NOT NULL,
 connector_kind text NOT NULL CHECK(connector_kind IN ('SSH','RDP','DB','K8S','CLOUD')),
 target_ref text NOT NULL,
 lease_expires_at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN ('REQUESTED','ACTIVE','TERMINATED','EXPIRED','REVOKED')),
 connector_session_ref text,
 created_at timestamptz NOT NULL DEFAULT now(),
 terminated_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tpay_pam_privileged_session ON tpay_pam_sessions(privileged_session_id);
CREATE TABLE IF NOT EXISTS tpay_pam_commands(
 id uuid PRIMARY KEY,
 pam_session_id uuid NOT NULL REFERENCES tpay_pam_sessions(id) ON DELETE CASCADE,
 command_digest char(64) NOT NULL CHECK(command_digest ~ '^[0-9a-f]{64}$'),
 command_class text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('ALLOW','DENY')),
 reason text NOT NULL,
 actor_id text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tpay_pam_commands_session_time ON tpay_pam_commands(pam_session_id,occurred_at DESC);
