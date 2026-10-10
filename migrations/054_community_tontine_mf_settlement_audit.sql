-- Append-only audit trail for partner-side settlement workflow.
-- Never records destination_ref or other routing secrets. Financial Core remains the sole Ledger authority.

CREATE TABLE IF NOT EXISTS community_tontine_mf_settlement_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  instruction_id uuid NOT NULL REFERENCES community_tontine_mf_settlement_instructions(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL,
  tontine_group_id uuid NOT NULL,
  microfinance_id uuid NOT NULL,
  payout_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created','updated')),
  previous_state text,
  new_state text NOT NULL,
  actor_id uuid NOT NULL,
  row_version bigint NOT NULL CHECK (row_version > 0),
  amount_minor numeric(38,0) NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_tontine_mf_settlement_audit_scope
  ON community_tontine_mf_settlement_audit
  (organization_id, tontine_group_id, microfinance_id, instruction_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION community_tontine_mf_log_settlement_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'COMMUNITY_TONTINE_SETTLEMENT_DELETE_FORBIDDEN';
  END IF;

  INSERT INTO community_tontine_mf_settlement_audit (
    instruction_id, organization_id, tontine_group_id, microfinance_id, payout_id,
    event_type, previous_state, new_state, actor_id, row_version, amount_minor, currency
  ) VALUES (
    NEW.id, NEW.organization_id, NEW.tontine_group_id, NEW.microfinance_id, NEW.payout_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.state END,
    NEW.state,
    CASE WHEN NEW.approved_by IS DISTINCT FROM CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.approved_by END
      THEN NEW.approved_by
      ELSE NEW.prepared_by
    END,
    NEW.version, NEW.amount_minor, NEW.currency
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_tontine_mf_settlement_audit ON community_tontine_mf_settlement_instructions;
CREATE TRIGGER trg_community_tontine_mf_settlement_audit
AFTER INSERT OR UPDATE ON community_tontine_mf_settlement_instructions
FOR EACH ROW EXECUTE FUNCTION community_tontine_mf_log_settlement_change();

DROP TRIGGER IF EXISTS trg_community_tontine_mf_settlement_no_delete ON community_tontine_mf_settlement_instructions;
CREATE TRIGGER trg_community_tontine_mf_settlement_no_delete
BEFORE DELETE ON community_tontine_mf_settlement_instructions
FOR EACH ROW EXECUTE FUNCTION community_tontine_mf_log_settlement_change();

COMMENT ON TABLE community_tontine_mf_settlement_audit IS
  'Append-only database-triggered audit events for settlement workflow. Do not grant application roles UPDATE or DELETE. Contains no destination routing secret.';
