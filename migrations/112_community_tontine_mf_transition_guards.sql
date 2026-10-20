-- Enforce append-only audit and monotonic settlement state transitions at the database boundary.

CREATE OR REPLACE FUNCTION community_tontine_mf_guard_settlement_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.tontine_group_id IS DISTINCT FROM OLD.tontine_group_id
     OR NEW.microfinance_id IS DISTINCT FROM OLD.microfinance_id
     OR NEW.payout_id IS DISTINCT FROM OLD.payout_id
     OR NEW.beneficiary_client_id IS DISTINCT FROM OLD.beneficiary_client_id
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.destination_ref IS DISTINCT FROM OLD.destination_ref
     OR NEW.requires_human_approval IS DISTINCT FROM OLD.requires_human_approval
     OR NEW.prepared_by IS DISTINCT FROM OLD.prepared_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_SETTLEMENT_IMMUTABLE_BINDING';
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_SETTLEMENT_VERSION_MUST_ADVANCE';
  END IF;

  IF NEW.state = OLD.state THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_SETTLEMENT_NOOP_TRANSITION';
  END IF;

  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     AND NOT (
       OLD.state = 'prepared' AND NEW.state = 'approved'
       AND OLD.approved_by IS NULL AND NEW.approved_by IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_SETTLEMENT_APPROVER_IMMUTABLE';
  END IF;

  IF NOT (
    (OLD.state = 'prepared' AND NEW.state IN ('approved','exception'))
    OR (OLD.state = 'approved' AND NEW.state IN ('submitted','provider_pending','settled','exception'))
    OR (OLD.state = 'submitted' AND NEW.state IN ('provider_pending','settled','exception'))
    OR (OLD.state = 'provider_pending' AND NEW.state IN ('settled','exception'))
  ) THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_SETTLEMENT_TRANSITION_DENIED';
  END IF;

  NEW.last_modified_at := GREATEST(NEW.last_modified_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_tontine_mf_settlement_state_guard ON community_tontine_mf_settlement_instructions;
CREATE TRIGGER trg_community_tontine_mf_settlement_state_guard
BEFORE UPDATE ON community_tontine_mf_settlement_instructions
FOR EACH ROW EXECUTE FUNCTION community_tontine_mf_guard_settlement_update();

CREATE OR REPLACE FUNCTION community_tontine_mf_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'COMMUNITY_TONTINE_SETTLEMENT_AUDIT_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS trg_community_tontine_mf_settlement_audit_no_mutation ON community_tontine_mf_settlement_audit;
CREATE TRIGGER trg_community_tontine_mf_settlement_audit_no_mutation
BEFORE UPDATE OR DELETE ON community_tontine_mf_settlement_audit
FOR EACH ROW EXECUTE FUNCTION community_tontine_mf_reject_audit_mutation();

DROP TRIGGER IF EXISTS trg_community_tontine_mf_settlement_audit_no_truncate ON community_tontine_mf_settlement_audit;
CREATE TRIGGER trg_community_tontine_mf_settlement_audit_no_truncate
BEFORE TRUNCATE ON community_tontine_mf_settlement_audit
FOR EACH STATEMENT EXECUTE FUNCTION community_tontine_mf_reject_audit_mutation();

COMMENT ON FUNCTION community_tontine_mf_guard_settlement_update() IS
  'Database guard for immutable payout bindings, optimistic version progression, maker/checker integrity, and monotonic settlement transitions.';
COMMENT ON FUNCTION community_tontine_mf_reject_audit_mutation() IS
  'Prevents UPDATE, DELETE and TRUNCATE of community tontine settlement audit evidence.';
