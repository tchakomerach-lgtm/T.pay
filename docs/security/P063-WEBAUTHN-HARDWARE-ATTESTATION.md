# P063 — WebAuthn Hardware Attestation Enrollment

## Scope
P063 adds a fail-closed registration path for packed X.509 attestation. It rejects self-attestation, none, FIDO-U2F and unrecognized formats. It parses the attested authenticator data, validates RP ID, origin, UP/UV/AT flags, credential ID, COSE public key and backup flag consistency.

## Trust policy
- A certificate chain must be supplied in the packed x5c statement.
- Every certificate must be time-valid; each child signature and issuer relation is verified.
- The leaf cannot be a CA; issuers and the terminal pinned root must be CAs.
- The terminal root must be self-signed and match a SHA-256 fingerprint in the active trust-root registry.
- The AAGUID must be explicitly allowed by that trusted root's reviewed metadata record.
- The attestation signature is verified over authenticatorData || SHA-256(clientDataJSON).
- No trust roots are seeded. An empty registry denies all hardware attestation.

## Persistence
- Challenge consumption, credential registration and audit are one PostgreSQL transaction.
- Credential stores the COSE public key, AAGUID, backup eligibility/state, attestation format and trusted root fingerprint.
- Duplicate credential IDs are rejected.
- Root records are immutable except for one-way revocation.

## Assurance boundary
This P063 registrar stores hardware-attestation evidence but does not itself upgrade P061 assertion results or P062 session assurance. P064 must bind a verified assertion to a credential whose attestation evidence is active and propagate hardware assurance to the PAM gate. This avoids a partial or premature elevation.

## Remaining
- Root metadata ingestion and independent dual-control approval ceremony.
- Additional attestation formats and FIDO Metadata Service validation.
- Hardware vendor interoperability fixtures and negative cryptographic test vectors.
- Live PostgreSQL tests under the restricted runtime role.
- Independent security review and hardware key recovery drills.
