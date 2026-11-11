# P061 — Cryptographic WebAuthn Assertion Verification

## Implemented
- Strict base64url decoding and clientDataJSON parsing.
- Validates `webauthn.get`, exact challenge hash, exact origin, cross-origin prohibition, RP ID hash, UP and UV flags.
- Parses a restricted COSE public-key set: ES256/P-256, RS256/RSA, EdDSA/Ed25519.
- Verifies the authenticator signature over authenticatorData || SHA-256(clientDataJSON).
- Locks the challenge and credential rows; rejects expired/replayed challenges and non-monotonic nonzero signature counters.
- Consumes the challenge and advances the credential counter in one PostgreSQL transaction.
- Unit tests generate a real P-256 keypair and sign assertions; tests cover success, missing UV, expiry, forged signature and origin mismatch.

## Deliberate security boundary
The verifier returns `webauthn_uv` only. It does not infer a hardware security key from browser flags, transport strings or a credential's presence. The P060 break-glass issuer requires the stronger `hardware_key` assurance; a separate trusted attestation/credential-enrollment policy must establish that assurance. This avoids silently upgrading a platform authenticator to hardware-key status.

## Not yet production certified
- Real PostgreSQL integration tests, race tests for two concurrent submissions, credential enrollment/attestation verification and backup-state policy remain.
- This verifier is an authentication assertion adapter, not a complete browser registration ceremony.
- A separate Admin session issuer/revoker must consume only a verified assertion and apply a short session TTL.
- Run crypto test vectors and independent security review before production activation.
