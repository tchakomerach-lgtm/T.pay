-- Root quorum domains are provisioned by trusted administrators, never asserted by approvers.
ALTER TABLE tpay_privileged_identities
  ADD COLUMN IF NOT EXISTS trust_domain text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tpay_privileged_identity_trust_domain_nonblank'
      AND conrelid = 'tpay_privileged_identities'::regclass
  ) THEN
    ALTER TABLE tpay_privileged_identities
      ADD CONSTRAINT tpay_privileged_identity_trust_domain_nonblank
      CHECK (trust_domain IS NULL OR length(trim(trust_domain)) BETWEEN 3 AND 128);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_tpay_privileged_trust_domain_active
  ON tpay_privileged_identities(trust_domain, privileged_level)
  WHERE active = true AND trust_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tpay_root_verification_key_active
  ON tpay_privileged_verification_keys(privileged_identity_id, credential_id)
  WHERE active = true;
