CREATE TABLE IF NOT EXISTS tpay_webauthn_stepup_challenges(
 id uuid PRIMARY KEY,user_id text NOT NULL,challenge text NOT NULL UNIQUE,rp_id text NOT NULL,origin text NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz);
CREATE INDEX IF NOT EXISTS idx_tpay_webauthn_stepup_user ON tpay_webauthn_stepup_challenges(user_id,expires_at);
CREATE TABLE IF NOT EXISTS tpay_privileged_verification_keys(
 id uuid PRIMARY KEY,privileged_identity_id uuid NOT NULL REFERENCES tpay_privileged_identities(id),credential_id text NOT NULL UNIQUE,algorithm text NOT NULL CHECK(algorithm IN ('ES256','Ed25519')),public_key_der bytea NOT NULL,hardware_backed boolean NOT NULL DEFAULT false,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_identity_verification_key ON tpay_privileged_verification_keys(privileged_identity_id,credential_id) WHERE active=true;
CREATE TABLE IF NOT EXISTS tpay_redteam_runs(
 id uuid PRIMARY KEY,scope text NOT NULL,scenario text NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),ended_at timestamptz,status text NOT NULL CHECK(status IN ('PLANNED','RUNNING','PASSED','FAILED','BLOCKED')),evidence_digest char(64) CHECK(evidence_digest IS NULL OR evidence_digest ~ '^[0-9a-f]{64}$'));
CREATE TABLE IF NOT EXISTS tpay_redteam_findings(
 id uuid PRIMARY KEY,run_id uuid NOT NULL REFERENCES tpay_redteam_runs(id),severity text NOT NULL CHECK(severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),control text NOT NULL,status text NOT NULL CHECK(status IN ('OPEN','MITIGATED','ACCEPTED')),evidence_digest char(64) NOT NULL CHECK(evidence_digest ~ '^[0-9a-f]{64}$'),created_at timestamptz NOT NULL DEFAULT now());
