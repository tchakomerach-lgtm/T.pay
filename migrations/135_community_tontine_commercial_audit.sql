-- CT-039: immutable, tenant-scoped audit trail for commercial governance mutations.
CREATE TABLE IF NOT EXISTS community_tontine_commercial_audit (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  object_type text NOT NULL CHECK (object_type IN ('ROLE_GRANT','PROMOTION_CAMPAIGN','PROMOTION_REDEMPTION')),
  object_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('CREATED','APPROVED','ACTIVATED','GRANTED','REVOKED','RESERVED','PENDING_APPROVAL')),
  actor_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload)='object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,group_id)
    REFERENCES tontine_groups(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_community_tontine_commercial_audit_scope
  ON community_tontine_commercial_audit(organization_id,group_id,occurred_at DESC);
ALTER TABLE community_tontine_commercial_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_tontine_commercial_audit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_tontine_commercial_audit_organization_scope
  ON community_tontine_commercial_audit;
CREATE POLICY community_tontine_commercial_audit_organization_scope
  ON community_tontine_commercial_audit
  USING (organization_id=public.tpay_current_organization_id())
  WITH CHECK (organization_id=public.tpay_current_organization_id());

CREATE OR REPLACE FUNCTION community_tontine_commercial_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COMMUNITY_TONTINE_COMMERCIAL_AUDIT_IMMUTABLE';
END;
$$;
DROP TRIGGER IF EXISTS trg_community_tontine_commercial_audit_immutable
  ON community_tontine_commercial_audit;
CREATE TRIGGER trg_community_tontine_commercial_audit_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON community_tontine_commercial_audit
FOR EACH STATEMENT EXECUTE FUNCTION community_tontine_commercial_audit_immutable();
