-- Durable admission, consent, trust-attestation and launch snapshots for the independent Community Tontine.
-- Governance decisions remain community-owned. Partner attestations never grant admission or Ledger authority.

CREATE TABLE IF NOT EXISTS community_tontine_candidates (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('DISCOVERED','APPLIED','VERIFYING','APPROVED','ACTIVE','REJECTED','EXPIRED','WITHDRAWN','SUSPENDED')),
  applied_at timestamptz NOT NULL,
  membership_lock_at timestamptz,
  decision text CHECK (decision IN ('ACCEPT','REJECT','REQUEST_MORE_INFORMATION','HOLD')),
  decision_by uuid,
  decision_reason text,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,group_id,id),
  FOREIGN KEY (organization_id,group_id) REFERENCES tontine_groups(organization_id,id),
  CHECK ((decision IS NULL AND decision_by IS NULL AND decision_reason IS NULL)
      OR (decision IS NOT NULL AND decision_by IS NOT NULL AND length(btrim(decision_reason)) > 0))
);
CREATE INDEX IF NOT EXISTS idx_community_tontine_candidates_queue
  ON community_tontine_candidates (organization_id,group_id,state,applied_at,id);

CREATE TABLE IF NOT EXISTS community_tontine_consents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('IDENTITY_VERIFICATION','FINANCIAL_PROFILE','TRUST_PASSPORT','FINAL_PARTICIPATION')),
  terms_version text NOT NULL CHECK (length(btrim(terms_version)) > 0),
  granted_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  contribution_amount_minor numeric(38,0) CHECK (contribution_amount_minor IS NULL OR contribution_amount_minor > 0),
  currency char(3),
  cadence text CHECK (cadence IS NULL OR cadence IN ('DAILY','WEEKLY','MONTHLY','CUSTOM')),
  rotation_order_hash char(64),
  FOREIGN KEY (organization_id,group_id,candidate_id)
    REFERENCES community_tontine_candidates(organization_id,group_id,id),
  CHECK (expires_at > granted_at),
  CHECK (purpose <> 'FINAL_PARTICIPATION' OR
    (contribution_amount_minor IS NOT NULL AND currency IS NOT NULL AND cadence IS NOT NULL AND rotation_order_hash ~ '^[a-fA-F0-9]{64}$'))
);
CREATE INDEX IF NOT EXISTS idx_community_tontine_consents_active
  ON community_tontine_consents (organization_id,group_id,candidate_id,purpose,expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS community_tontine_trust_attestations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  verification_ref text NOT NULL,
  match_result text NOT NULL CHECK (match_result IN ('MATCH','PARTIAL_MATCH','MISMATCH','UNABLE_TO_VERIFY')),
  status text NOT NULL CHECK (status IN ('PENDING','VALID','EXPIRED','REVOKED','SUPERSEDED','DISPUTED')),
  trust_level smallint NOT NULL CHECK (trust_level BETWEEN 0 AND 4),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  signature text NOT NULL CHECK (length(btrim(signature)) > 0),
  revoked_at timestamptz,
  FOREIGN KEY (organization_id,group_id,candidate_id)
    REFERENCES community_tontine_candidates(organization_id,group_id,id),
  CHECK (expires_at > issued_at)
);
CREATE INDEX IF NOT EXISTS idx_community_tontine_attestations_scope
  ON community_tontine_trust_attestations (organization_id,group_id,candidate_id,partner_id,status,expires_at);

CREATE TABLE IF NOT EXISTS community_tontine_admission_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('ACCEPT','REJECT','REQUEST_MORE_INFORMATION','HOLD')),
  previous_state text NOT NULL,
  new_state text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,group_id,candidate_id)
    REFERENCES community_tontine_candidates(organization_id,group_id,id)
);
CREATE INDEX IF NOT EXISTS idx_community_tontine_admission_audit
  ON community_tontine_admission_audit (organization_id,group_id,candidate_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS community_tontine_launch_snapshots (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  config_hash char(64) NOT NULL CHECK (config_hash ~ '^[a-fA-F0-9]{64}$'),
  rotation_snapshot_hash char(64) NOT NULL CHECK (rotation_snapshot_hash ~ '^[a-fA-F0-9]{64}$'),
  canonical_payload jsonb NOT NULL,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  state text NOT NULL CHECK (state IN ('ARMED','ACTIVE','PAUSED','SUSPENDED','EMERGENCY_HOLD')),
  armed_by uuid NOT NULL,
  activated_by uuid,
  armed_at timestamptz NOT NULL,
  activated_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (organization_id,group_id,id),
  UNIQUE (organization_id,group_id,idempotency_key),
  FOREIGN KEY (organization_id,group_id) REFERENCES tontine_groups(organization_id,id),
  CHECK ((state <> 'ACTIVE') OR (activated_by IS NOT NULL AND activated_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_community_tontine_launch_state
  ON community_tontine_launch_snapshots (organization_id,group_id,state,armed_at DESC);

CREATE OR REPLACE FUNCTION prevent_community_tontine_admission_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COMMUNITY_TONTINE_ADMISSION_AUDIT_IMMUTABLE';
END;
$$;
DROP TRIGGER IF EXISTS trg_community_tontine_admission_audit_immutable ON community_tontine_admission_audit;
CREATE TRIGGER trg_community_tontine_admission_audit_immutable
BEFORE UPDATE OR DELETE ON community_tontine_admission_audit
FOR EACH ROW EXECUTE FUNCTION prevent_community_tontine_admission_audit_mutation();

COMMENT ON TABLE community_tontine_candidates IS
  'Candidate workflow for the independent Community Tontine. Admission decisions are made by community administrators, never by partner microfinance.';
COMMENT ON TABLE community_tontine_consents IS
  'Purpose-bound, expiring and revocable participant consents. Final participation consent stores the exact financial and rotation terms accepted.';
COMMENT ON TABLE community_tontine_trust_attestations IS
  'Scoped third-party verification evidence. Attestation is not an admission decision or a credit score.';
COMMENT ON TABLE community_tontine_launch_snapshots IS
  'Immutable-by-contract launch configuration snapshot. Financial Core remains the only Ledger authority.';
