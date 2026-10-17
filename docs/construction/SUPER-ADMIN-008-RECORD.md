# Super Admin Bible — Construction Record 009

## Source
Prompt 003 Root of Trust + Prompt 004 Admin Lifecycle + Prompt 005 PIM/PAM + Prompt 007 Threat Intelligence/Threat Hunting + Prompt 008 Cyber Resilience/Disaster Recovery.

## New security increment
- `packages/security/src/root-trust-provider.ts`: root quorum now rejects duplicate actor identities before database access.
- Root approval expiry is bounded to a maximum five-minute authorization window.
- Root approver domain must match the identity's server-provisioned `trust_domain`; the caller-provided domain is not authoritative.
- Production root approvals require a registered verification credential and a hardware-backed key marker.
- Production provider check is invoked inside the root authorization boundary, not left to callers.
- Migration `053_root_trust_domain_binding.sql` adds an idempotent trust-domain field/constraint and active-domain index.
- PostgreSQL concurrency fixture now provisions independent identity/security/infrastructure domains.
- Unit tests reject repeated approver identities and excessive approval TTL before database access.

## Existing controls retained
1. Privileged identity assurance and expiry.
2. Maximum 15-minute JIT grants.
3. Justification required for privileged grants.
4. One-shot grants expire on consumption.
5. Root operations require three distinct actors and three independently provisioned trust domains.
6. Root operations are bound to a SHA-256 request digest and protected against replay.
7. Recovery uses an explicit state machine.
8. Financial reopening fails closed unless critical trust/reconciliation gates pass.
9. Recovery metadata is durable; secrets and private keys are excluded.
10. Direct production recovery is forbidden by the domain contract.

## Verification status
- Code and tests committed to the construction branch.
- Latest observed CI jobs fail before any steps are reported: GitHub reports runner ID 0, no runner name, and no step records. Downloaded job logs return BlobNotFound. This is an infrastructure/runner diagnosis gap, not proof that tests passed or failed.
- Exact-head CI is **not certified green**.
- HSM/KMS, hardware attestation, real PAM connectors, immutable backup storage and independent clean-room restore remain external production gates.

## Next gate
Restore a diagnosable GitHub Actions runner and run all checks on the exact head SHA. Then verify domain provisioning, quorum replay/concurrency, WebAuthn with real registered authenticators, provider-backed root signing, PAM session enforcement and an independent recovery drill. Keep PR Draft until the evidence is complete.
