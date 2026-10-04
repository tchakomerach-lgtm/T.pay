CREATE TABLE IF NOT EXISTS mfi_recovery_outbox (
 event_id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), aggregate_type text NOT NULL,
 aggregate_id uuid NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL, occurred_at timestamptz NOT NULL,
 published_at timestamptz, attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 UNIQUE(organization_id,event_id)
);
CREATE INDEX IF NOT EXISTS idx_mfi_recovery_outbox_unpublished ON mfi_recovery_outbox(organization_id,occurred_at) WHERE published_at IS NULL;
