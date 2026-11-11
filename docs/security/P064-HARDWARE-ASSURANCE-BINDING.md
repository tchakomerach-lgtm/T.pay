# P064 — Hardware assurance binding and revocation

## Objective
Make `hardware_key` a database-backed assurance claim, not a value inferred from a browser flag or an earlier registration result.

## Authentication binding
- P061 still verifies the signed WebAuthn assertion, challenge, origin, RP ID, user presence, user verification and signature counter.
- P064 joins the exact credential to its stored P063 attestation evidence.
- A credential is hardware-assured only when `hardware_attested=true`, its pinned root fingerprint exists, and the root remains visible as `active` under the restricted RLS policy.
- A revoked, missing or hidden root fails closed; the assertion is not accepted as a hardware-key assertion.

## Session binding
- Session issuance re-locks the exact credential and rechecks its active root in the session transaction.
- The principal's `assurance_floor` is enforced. A `hardware_key` floor rejects an ordinary UV-only credential.
- The session stores the verified assurance level. The opaque token remains hashed at rest.
- Every hardware-key session validation rechecks the credential attestation and root status. Root revocation therefore invalidates previously issued hardware-key sessions on their next validation.
- Session expiry remains fixed; no sliding extension.

## PAM and break-glass
- PAM requester sessions and every approver session must be hardware-attested and rooted in an active trust anchor.
- The PAM capability remains exact-scope, one-use, time-bounded and audited in the same transaction.
- The database trigger independently enforces hardware attestation and active root for break-glass approvals.
- Root registry reads are granted only to the isolated Admin and PAM runtime roles; the RLS policies expose active roots only.

## PostgreSQL integration
`admin-hardware-assurance.postgres.integration.test.ts` exercises a real signed ES256 assertion against PostgreSQL, verifies issuance of a hardware-key session, then revokes the root and confirms the existing session is rejected. It is included in `npm run test:postgres`.

## Assurance boundary and remaining work
P064 binds the assertion/session/PAM path to attestation evidence. It does not replace full RFC 5280 PKIX validation, FIDO Metadata Service validation, independent trust-root provisioning/dual control, production runtime-login provisioning, KMS/HSM integration, or an independent red-team review. P063/P064 must not be marked production-certified until those gates and the full CI/field evidence are complete.
