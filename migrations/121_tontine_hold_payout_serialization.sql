-- Serialize targeted hold writes with payout initiation.
-- A hold inserted while a payout exists locks that payout row. markInitiated()
-- takes the same row lock before checking active holds and transitioning state.
CREATE OR REPLACE FUNCTION tontine_lock_payouts_for_targeted_hold()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.scope = 'payout' THEN
    PERFORM 1
      FROM payout_intents pi
     WHERE pi.organization_id = NEW.organization_id
       AND pi.payout_id = NEW.reference
     FOR UPDATE;
  ELSIF NEW.scope = 'membership' THEN
    PERFORM 1
      FROM payout_intents pi
      JOIN tontine_beneficiary_slots slot
        ON slot.organization_id = pi.organization_id
       AND slot.id = pi.tontine_slot_id
     WHERE pi.organization_id = NEW.organization_id
       AND slot.beneficiary_membership_id::text = NEW.reference
     FOR UPDATE OF pi;
  ELSIF NEW.scope = 'provider_reference' THEN
    PERFORM 1
      FROM payout_intents pi
     WHERE pi.organization_id = NEW.organization_id
       AND (pi.destination_ref = NEW.reference OR pi.provider_reference = NEW.reference)
     FOR UPDATE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tontine_hold_lock_payouts ON tontine_targeted_holds;
CREATE TRIGGER trg_tontine_hold_lock_payouts
BEFORE INSERT OR UPDATE OF scope, reference, released_at, expires_at
ON tontine_targeted_holds
FOR EACH ROW
EXECUTE FUNCTION tontine_lock_payouts_for_targeted_hold();

COMMENT ON FUNCTION tontine_lock_payouts_for_targeted_hold() IS
  'Locks matching organization-scoped payout rows so targeted holds serialize with payout initiation.';
