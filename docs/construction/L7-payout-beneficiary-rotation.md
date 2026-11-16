# Layer 7 Construction Record — Payout + beneficiary rotation

**Status:** IN PROGRESS — payout intent/provider boundary implemented; confirmed settlement integration remains.

## Implemented
- payout state machine;
- positive minor-unit amount and currency validation;
- KYC gate;
- human approval default and self-approval prevention;
- organization-scoped idempotency schema;
- approval persistence;
- deterministic beneficiary rotation foundation;
- live PostgreSQL isolation/idempotency test.

## Not yet complete
- concrete live provider credentials/network integration and signed callback wiring;
- atomic payout-to-Ledger posting integration after confirmed provider settlement;
- payout reconciliation/exception integration;
- full KYC/beneficiary eligibility service;
- production Mobile Money/TMoney/Flooz payout execution.

Layer 7 must not be declared complete until these boundaries and adversarial concurrency tests are green.

## Durable Community Tontine payout persistence — increment 002

Implemented on the current construction branch:

- PostgresTontinePayoutRepository.createIfAbsent persists payout intents only when the beneficiary slot is already eligible, the beneficiary membership is active, the slot amount/cycle/member match, and the selected microfinance partner matches.
- Organization-scoped idempotency is enforced by the existing unique key. Replays compare beneficiary, cycle, amount, currency and destination; mismatched replays fail closed.
- Human approval is persisted in payout_approvals under a row lock. The beneficiary cannot approve their own payout. The intent advances to approved only in the same database transaction as the approval record.
- Provider initiation evidence is stored separately from settlement truth. A rejected provider request is persisted as failed; an accepted/pending initiation remains initiated.
- markSettled requires a ledger transaction ID protected by a composite organization foreign key, records a verified provider event identity and marks the eligible beneficiary slot paid in the same repository transaction.
- Migration 119 adds provider identity/reference/event fields and the organization-scoped Ledger foreign key. It does not create a second ledger.
- A durable orchestration function now sequences persistence, KYC gate, independent approval, provider initiation and durable state transitions. It deliberately does not call the payout confirmed on a provider response.

## Remaining release gates

- Wire this repository into the authenticated production API and production provider registry; this increment is not yet an end-user API workflow.
- Integrate the final payout confirmation update into the same Financial Core transaction boundary, or provide a durable reconciliation worker for the ledger-committed / payout-state-not-yet-confirmed failure window.
- Add live PostgreSQL tests for slot eligibility locking, same-key concurrent creation, approval races, provider-event uniqueness, cross-organization isolation and Ledger foreign-key enforcement.
- Add signed payout callback verification and bind the verified provider event to payout ID, organization, reference, amount and currency before invoking Financial Core.
- Complete KYC/beneficiary evidence, dispute/refund and field/offline adversarial tests.

Status remains IN PROGRESS. A green CI run alone does not certify payout execution or live provider readiness.