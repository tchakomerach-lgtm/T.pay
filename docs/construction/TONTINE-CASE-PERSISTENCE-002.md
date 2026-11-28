# TONTINE-CASE-PERSISTENCE-002 — Durable case operations

## Scope
Persist Community Tontine disputes, incidents, evidence, targeted holds and refund requests in PostgreSQL. All operations are tenant-scoped.

## Controls
- Compare-and-set state transitions reject stale concurrent updates.
- Case and evidence inserts require a same-organization parent.
- Evidence stores a SHA-256 digest and opaque object reference, not raw evidence bytes.
- Evidence rows are append-only; corrections require a new record.
- Targeted holds are tenant-scoped and can be released only once.
- Refund requests require exactly one original contribution or payout and a positive integer-minor-unit amount.
- Refund workflow must pass through `submitted_to_financial_core`; this module does not post, reverse or settle money.

## Financial boundary
Financial Core remains the sole Ledger and settlement authority. A workflow state is not proof of a completed refund. The authoritative Financial Core result must be reconciled separately.

## Validation gate
The final branch must pass TypeScript/unit checks, the complete PostgreSQL migration chain and integration suite, security checks, Web build, Android build and Flutter analysis/tests on the exact same SHA. No production certification is implied by source creation.

## Rollback
Migration 116 adds tenant/group foreign keys, indexes and an append-only evidence trigger. Before any rollback, inspect existing case/evidence/hold/refund records and preserve all financial evidence and Ledger history.
