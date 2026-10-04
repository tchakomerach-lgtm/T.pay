ALTER TABLE payout_provider_events ADD CONSTRAINT payout_provider_events_org_payout_fk FOREIGN KEY (organization_id,payout_id) REFERENCES payout_intents(organization_id,payout_id);
ALTER TABLE payout_reversals ADD CONSTRAINT payout_reversals_org_payout_fk FOREIGN KEY (organization_id,payout_id) REFERENCES payout_intents(organization_id,payout_id);
ALTER TABLE payout_exceptions ADD CONSTRAINT payout_exceptions_org_payout_fk FOREIGN KEY (organization_id,payout_id) REFERENCES payout_intents(organization_id,payout_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_reversals_active ON payout_reversals(organization_id,payout_id) WHERE state IN ('requested','provider_pending','provider_confirmed','financially_settled');
