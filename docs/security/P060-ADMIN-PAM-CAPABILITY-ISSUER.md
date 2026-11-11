# P060 — Admin PAM Capability Issuer

## Delivered in this slice
- Separate `tpay_admin_pam_runtime` NOLOGIN/NOSUPERUSER/NOBYPASSRLS database role.
- RLS restricted to the current Admin principal/session; no tenant-data table, ciphertext, vault-key or KMS grant is exposed.
- Revalidates active Admin principal, independent Admin session, hashed session token, active credential and hardware-key assurance.
- Locks the exact break-glass request and revalidates approval quorum, independent active hardware-backed approvers, purpose, incident/ticket and a maximum 60-minute validity window.
- Issues one opaque random capability, stores only its SHA-256 hash, binds it to one request, principal, session, tenant, organization, resource type/ref, permission, purpose and ticket.
- Consumes the approved request and appends the security audit in the same PostgreSQL transaction. Audit failure rolls back capability issuance and request consumption.
- A unique request constraint prevents issuing a second capability for the same break-glass request.

## Security boundary
This issuer does not read or decrypt protected data. It does not return database credentials, KMS/ HSM keys, wrapped DEKs or plaintext. The capability is not itself permission to bypass a data broker: the target domain broker must independently validate the token hash, exact resource scope, expiry, revocation and one-use consumption and must write its own access audit before returning data.

Super Admin remains a governance identity, not a standing data identity. No global tenant scan, cross-organization fallback, bulk export or parent/child privilege inheritance is implemented.

## Remaining activation gates
- Production WebAuthn ceremony verifier (challenge/origin/RP-ID/signature/UP+UV/credential counter) and secure Admin session issuer/revoker.
- Independent Admin API deployment, origin and cookie; production runtime DB login membership provisioned out-of-band.
- Capability consumer integrated into the P059 Vault Access Broker and KMS/HSM policy, including atomic one-use consumption.
- Live PostgreSQL tests for RLS, concurrency, replay, revocation, approval mutation, session theft and audit rollback.
- KMS/HSM provider contract tests, key recovery/rotation drills, red-team and independent review.

This is an implementation slice, not production certification. No WebAuthn cryptographic verification or production HSM integration is claimed.


## CI trigger correction
The P059 base workflow now includes pull-request validation for PRs targeting the P059 branch. This PR must be validated against its current head after the base update; no CI result is inferred from the Android or preview checks.
