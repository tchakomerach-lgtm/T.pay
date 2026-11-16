-- Enforce append-only evidence and immutable launch terms at the database boundary.

CREATE OR REPLACE FUNCTION guard_community_tontine_consent_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_CONSENT_DELETE_FORBIDDEN';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
     OR NEW.partner_id IS DISTINCT FROM OLD.partner_id
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.terms_version IS DISTINCT FROM OLD.terms_version
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.contribution_amount_minor IS DISTINCT FROM OLD.contribution_amount_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.cadence IS DISTINCT FROM OLD.cadence
     OR NEW.rotation_order_hash IS DISTINCT FROM OLD.rotation_order_hash
     OR OLD.revoked_at IS NOT NULL
     OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_CONSENT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_community_tontine_consent_guard ON community_tontine_consents;
CREATE TRIGGER trg_community_tontine_consent_guard
BEFORE UPDATE OR DELETE ON community_tontine_consents
FOR EACH ROW EXECUTE FUNCTION guard_community_tontine_consent_mutation();

CREATE OR REPLACE FUNCTION guard_community_tontine_attestation_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COMMUNITY_TONTINE_ATTESTATION_APPEND_ONLY';
END;
$$;
DROP TRIGGER IF EXISTS trg_community_tontine_attestation_immutable ON community_tontine_trust_attestations;
CREATE TRIGGER trg_community_tontine_attestation_immutable
BEFORE UPDATE OR DELETE ON community_tontine_trust_attestations
FOR EACH ROW EXECUTE FUNCTION guard_community_tontine_attestation_immutability();

CREATE OR REPLACE FUNCTION guard_community_tontine_launch_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_LAUNCH_SNAPSHOT_DELETE_FORBIDDEN';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.config_hash IS DISTINCT FROM OLD.config_hash
     OR NEW.rotation_snapshot_hash IS DISTINCT FROM OLD.rotation_snapshot_hash
     OR NEW.canonical_payload IS DISTINCT FROM OLD.canonical_payload
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.armed_by IS DISTINCT FROM OLD.armed_by
     OR NEW.armed_at IS DISTINCT FROM OLD.armed_at
     OR OLD.state <> 'ARMED'
     OR NEW.state <> 'ACTIVE'
     OR NEW.activated_by IS NULL
     OR NEW.activated_at IS NULL
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_LAUNCH_SNAPSHOT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_community_tontine_launch_snapshot_guard ON community_tontine_launch_snapshots;
CREATE TRIGGER trg_community_tontine_launch_snapshot_guard
BEFORE UPDATE OR DELETE ON community_tontine_launch_snapshots
FOR EACH ROW EXECUTE FUNCTION guard_community_tontine_launch_snapshot();

COMMENT ON FUNCTION guard_community_tontine_consent_mutation() IS
  'Consent terms are immutable; a grant may be revoked once, but never rewritten or deleted.';
COMMENT ON FUNCTION guard_community_tontine_launch_snapshot() IS
  'Launch payload, hashes, scope and idempotency key are immutable; only ARMED to ACTIVE is permitted.';
