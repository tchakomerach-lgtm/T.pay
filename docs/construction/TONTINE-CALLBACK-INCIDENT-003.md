# TONTINE-CALLBACK-INCIDENT-003 — Automated incident workflow

## Outcome
A verified provider callback rejected by the payout state machine now opens one durable Community Tontine incident, stores immutable evidence metadata and publishes a transactional outbox event.

## Bible and architecture constraints
- `AGENTS.md`, `docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md`, `docs/skills/TPAY-CONSTRUCTION-001.md`
- `docs/skills/TPAY-TONTINE-CYCLE-001.md`: provider mismatch is a reconciliation exception; do not silently correct.
- `docs/skills/TPAY-FIN-002.md`: provider callbacks are untrusted and never edit ledger state.
- `docs/skills/TPAY-SEC-001.md`: deny by default, tenant binding, immutable evidence and replay protection.
- `docs/architecture/ADR-004-community-tontine.md`: independent domain; no second ledger.
- `docs/architecture/ADR-021-payout-reconciliation-reversal.md`: no ledger correction outside Financial Core.

## Implemented
1. Migration 117 adds a stable `source_event_key` with a tenant-scoped unique partial index.
2. Human-opened cases retain their actor ID. System-opened cases use `opened_by = NULL` and `opened_by_system = true`; no human identity is fabricated.
3. `recordTontineProviderIncident` resolves the authoritative group through the callback's cycle in the same organization.
4. One incident case is created per provider + event identity. Concurrent/replayed callbacks converge on the existing case.
5. Evidence stores SHA-256 of the raw callback body and an opaque provider-event reference. The raw body, signatures and credentials are not copied into case or outbox payloads.
6. Case, evidence and `tontine.provider_incident.opened` outbox event are written through the callback's existing transaction.
7. Callback payload mismatch, missing payout intent and payout-not-approved outcomes invoke this workflow. A rejected callback never calls the Financial Core settlement bridge.
8. If the referenced cycle cannot be resolved, the callback rejection remains durable but no group/case is fabricated; the unresolved cycle is an explicit follow-up reconciliation gap.

## Failure and concurrency
- Unique index is the final duplicate barrier; deterministic IDs provide stable replay identity.
- Any failure after case insert rolls back case/evidence/outbox together with the callback transaction.
- Duplicate source event returns the existing case and does not enqueue a second outbox event.
- No notification is sent inside the transaction. Existing outbox dispatcher owns post-commit delivery.
- No financial balance, ledger entry, payout state or refund is changed by this incident workflow.

## Tests
- Unit tests cover new case + evidence + outbox, replay deduplication and missing-cycle fail-closed behavior.
- Callback security test asserts payload substitution returns a durable rejected outcome.
- Live PostgreSQL migration/constraint and transaction coverage remains a CI acceptance gate; this record does not claim it passed.

## Rollback
The migration is additive. Rollback must preserve case/evidence/outbox history; do not drop source identity or delete incidents in a production environment. Disable incident creation only through a reviewed feature/configuration gate, while preserving callback quarantine.
