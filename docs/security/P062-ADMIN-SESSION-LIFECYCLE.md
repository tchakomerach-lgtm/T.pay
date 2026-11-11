# P062 — Admin Session Lifecycle

## Implemented
- Session issuance requires a successful P061 assertion result.
- Stores only SHA-256 of a 256-bit opaque session token.
- Uses a dedicated HTTPS Admin origin and the ADMIN_CONTROL security plane.
- Fixed lifetime, default 15 minutes, configurable only from 60 to 900 seconds.
- Re-checks principal status, credential status/revocation and session origin at each validation.
- Session validation never extends the fixed expiry; last_seen is touched at most once per minute.
- Self-revocation is transactional with append-only security audit.
- Audit failure rolls back issuance or revocation.
- Unit tests cover successful issuance, assurance floor, inactive principal, revoked credential, fabricated assertion, expiry, revocation and invalid configuration.

## Assurance boundary
P061 proves user verification for a WebAuthn assertion, not hardware attestation. P062 will not upgrade `webauthn_uv` to `hardware_key`. Principals whose policy floor is `hardware_key` are rejected until a separate trusted registration/attestation pipeline is deployed. P060 PAM therefore remains blocked for those principals.

## Not production certified
- Live PostgreSQL tests and concurrent revocation/validation races remain.
- Cookie transport, CSRF/origin middleware and deployment secret rotation must be integrated in the Admin API.
- Admin API must use a separate database role/pool and must not expose session tokens in logs.
- Independent security review and incident-recovery drills remain mandatory.
