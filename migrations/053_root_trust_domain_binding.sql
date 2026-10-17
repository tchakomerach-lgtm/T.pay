-- Root quorum domains are provisioned by trusted administrators, never asserted by approvers.
ALTER TABLE tpay_privileged_identities
  ADD COLUMN IF NOT EXISTS trust_domain text;
ALTER TABLE tpay_privileged_identities
  ADD CONSTRAINT tpay_privileged_identity_trust_domain_nonblank
  CHECK (trust_domain IS NULL OR length(trim(trust_domain)) BETWEEN 3 AND 128);
CREATE INDEX IF NOT EXISTS idx_tpay_privileged_trust_domain_active
  ON tpay_privileged_identities(trust_domain, privileged_level)
  WHERE active = true AND trust_domain IS NOT NULL;

-- Active root credentials must be unique and identify their hardware posture.
CREATE INDEX IF NOT EXISTS idx_tpay_root_verification_key_active
  ON tpay_privileged_verification_keys(privileged_identity_id, credential_id)
  WHERE active = true;
