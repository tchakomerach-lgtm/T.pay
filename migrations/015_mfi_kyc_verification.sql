CREATE TABLE IF NOT EXISTS mfi_kyc_verification_events (
 verification_id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), kyc_id uuid NOT NULL,
 customer_id text NOT NULL, provider text NOT NULL, external_reference text NOT NULL, evidence_hash text NOT NULL,
 status text NOT NULL CHECK(status IN ('submitted','verified','rejected','expired','quarantined')),
 verified_at timestamptz, expires_at timestamptz, received_at timestamptz NOT NULL,
 UNIQUE(organization_id,provider,external_reference)
);
CREATE INDEX IF NOT EXISTS idx_mfi_kyc_customer ON mfi_kyc_verification_events(organization_id,customer_id,received_at);
