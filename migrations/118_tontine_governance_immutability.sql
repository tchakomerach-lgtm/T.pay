-- Governance payload durability and database-enforced immutability for Community Tontine.
ALTER TABLE tontine_governance_proposals
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_governance_proposals_payload_object_check' AND conrelid='tontine_governance_proposals'::regclass) THEN
    ALTER TABLE tontine_governance_proposals ADD CONSTRAINT tontine_governance_proposals_payload_object_check CHECK (jsonb_typeof(payload)='object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tontine_governance_proposals_finalized_state_check' AND conrelid='tontine_governance_proposals'::regclass) THEN
    ALTER TABLE tontine_governance_proposals ADD CONSTRAINT tontine_governance_proposals_finalized_state_check CHECK ((status='open' AND finalized_at IS NULL) OR (status<>'open' AND (finalized_at IS NOT NULL OR quorum_percent_snapshot IS NULL)));
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION guard_tontine_governance_policy_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.policy_version<>1 THEN RAISE EXCEPTION 'TONTINE_GOVERNANCE_POLICY_VERSION_MUST_START_AT_ONE'; END IF;
  ELSE
    IF NEW.organization_id<>OLD.organization_id OR NEW.group_id<>OLD.group_id THEN RAISE EXCEPTION 'TONTINE_GOVERNANCE_POLICY_SCOPE_IMMUTABLE'; END IF;
    IF NEW.policy_version<>OLD.policy_version+1 THEN RAISE EXCEPTION 'TONTINE_GOVERNANCE_POLICY_VERSION_NOT_MONOTONIC'; END IF;
    IF NEW.effective_at<=OLD.effective_at THEN RAISE EXCEPTION 'TONTINE_GOVERNANCE_POLICY_EFFECTIVE_AT_NOT_MONOTONIC'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tontine_governance_policy_version ON tontine_governance_group_policies;
CREATE TRIGGER trg_tontine_governance_policy_version BEFORE INSERT OR UPDATE ON tontine_governance_group_policies FOR EACH ROW EXECUTE FUNCTION guard_tontine_governance_policy_version();
CREATE OR REPLACE FUNCTION guard_tontine_governance_proposal_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id<>OLD.organization_id OR NEW.group_id<>OLD.group_id OR NEW.proposer_id<>OLD.proposer_id OR NEW.type<>OLD.type OR NEW.payload_version<>OLD.payload_version OR NEW.payload_hash<>OLD.payload_hash OR NEW.payload<>OLD.payload OR NEW.opened_at<>OLD.opened_at OR NEW.closes_at<>OLD.closes_at OR NEW.quorum_percent_snapshot IS DISTINCT FROM OLD.quorum_percent_snapshot OR NEW.approval_percent_snapshot IS DISTINCT FROM OLD.approval_percent_snapshot OR NEW.allow_abstention_snapshot IS DISTINCT FROM OLD.allow_abstention_snapshot OR NEW.eligible_member_count_snapshot IS DISTINCT FROM OLD.eligible_member_count_snapshot OR NEW.policy_version_snapshot IS DISTINCT FROM OLD.policy_version_snapshot THEN
    RAISE EXCEPTION 'TONTINE_GOVERNANCE_PROPOSAL_SNAPSHOT_IMMUTABLE';
  END IF;
  IF OLD.status<>'open' AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'TONTINE_GOVERNANCE_PROPOSAL_FINAL_STATE_IMMUTABLE'; END IF;
  IF OLD.status<>'open' AND NEW.finalized_at IS DISTINCT FROM OLD.finalized_at THEN RAISE EXCEPTION 'TONTINE_GOVERNANCE_PROPOSAL_FINALIZED_AT_IMMUTABLE'; END IF;
  IF NEW.status='open' AND NEW.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'TONTINE_GOVERNANCE_OPEN_PROPOSAL_CANNOT_BE_FINALIZED'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tontine_governance_proposal_snapshot ON tontine_governance_proposals;
CREATE TRIGGER trg_tontine_governance_proposal_snapshot BEFORE UPDATE ON tontine_governance_proposals FOR EACH ROW EXECUTE FUNCTION guard_tontine_governance_proposal_snapshot();
COMMENT ON COLUMN tontine_governance_proposals.payload IS 'Canonical, immutable JSON object describing the proposed Community Tontine governance change.';
COMMENT ON FUNCTION guard_tontine_governance_proposal_snapshot() IS 'Prevents post-opening edits to proposal payload and quorum/approval snapshots; only finalization may change status.';
