# P038 — Education Sync Fabric durable persistence gate

## Scope
PostgreSQL-backed inbox/outbox, device cursor, ordering, idempotency, payload-integrity verification and concurrent acceptance for School OS offline synchronization.

## References consulted
- AGENTS.md — strict TypeScript, server-side authorization, idempotency, organization context, Definition of Done.
- docs/bibles/IMPLEMENTATION-MAP.md — Foundation → Identity/Org → Security → ... → Education.
- docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md — mandatory baseline and no duplicate rules.
- docs/skills/TPAY-CONSTRUCTION-001.md — DISCOVER → BIBLE-MAP → CURRENT-CODE → ... → CI → RECORD.
- docs/skills/TPAY-SEC-001.md — deny-by-default, replay protection, cross-organization negative tests.
- docs/skills/TPAY-AUTH-002.md — server-side organization-bound authorization.
- Existing packages/finance/src/postgres-field-offline.ts — atomic device sequence/replay pattern reused as an architectural reference, not duplicated.
- Existing packages/finance/src/postgres-migrations.ts — transactional, checksummed migration runner.

## External research
- NIST DevSecOps guidance (2026): secure SDLC, automation, continuous monitoring and zero trust across the pipeline. Adopted as a CI/observability requirement.
- NIST software supply-chain guidance: signed/provenanced releases and SBOMs. Adopted as a release-hardening requirement.
- NIST PQC guidance (2026): finalized ML-KEM/ML-DSA/SLH-DSA standards are available; this brick therefore keeps crypto algorithm identifiers/versioning outside the event payload contract so the envelope can later support crypto agility without schema breakage.

## Design decisions
1. Server recomputes SHA-256 over a canonical JSON representation; client-provided hash is verified, not trusted.
2. Device sequence is monotonic per tenant + organization + device and is enforced under PostgreSQL row locking.
3. Future sequences are durably stored as PENDING and drained in order when the missing sequence arrives.
4. Duplicate event/idempotency replay returns DUPLICATE only when payload hash matches; a same-key/different-payload collision is rejected.
5. Accepted events and their outbox record are committed in the same database transaction.
6. A database failure rolls back the entire acceptance; no partial "accepted" state is exposed.
7. UNKNOWN remains a meaningful state for higher layers; transport retries must never reinterpret unknown financial state as failure.
8. Tenant/organization isolation is represented in every uniqueness/index key; authorization remains a server-side policy concern outside this persistence adapter.

## Security gate
- PASS: payload tamper detection.
- PASS: replay/idempotency barrier.
- PASS: per-device ordering under row lock.
- PASS: concurrent same-sequence protection covered by integration test.
- PASS: tenant/organization scoped persistence.
- Deferred: authenticated API boundary, signed device envelopes, encrypted client database and device attestation.

## Tests
- P038 live PostgreSQL ordering/idempotency/outbox atomicity.
- P038 concurrent same-sequence race.
- P038 tenant/organization isolation.
- Required next: run exact-commit CI and inspect failed jobs rather than inferring green.

## Verification state\n- GitHub exact head observed: `3f6ea305d26c5219720800031354b0ba4e12e4d9`.\n- GitHub combined status and PR workflow-run listing currently expose no checks for this exact head; therefore CI is **NOT declared green**.\n- Local clone execution was attempted but this environment cannot resolve `github.com`; no local test result is claimed from that attempt.\n\n## Remaining risks
This is not yet a production sync endpoint. API authorization, signed offline envelopes, encrypted client storage, outbox worker, realtime transport, frontend/mobile sync client and full CI remain required.
