# P057.4 — Tontine provider reconciliation engine

## Scope
This increment persists a deterministic operational finding for each verified provider callback receipt and compares it with the canonical payout intent within the same organization. It does not post, reverse, refund, hold, or settle money.

## Classification and severity
- `matched`: callback processed; payout intent exists; amount and currency match; payout is confirmed.
- `callback_rejected`: provider callback was durably rejected.
- `payout_intent_missing`: callback has no matching payout intent in the same organization.
- `amount_mismatch` / `currency_mismatch`: provider evidence differs from canonical payout intent.
- `payout_state_mismatch`: callback is not processed or payout has not reached confirmed state.

Amount/currency discrepancies and missing payout intent are critical. Rejected callbacks and incompatible payout states are high/medium. Findings are refreshed idempotently; repeat checks increment a counter. A finding is resolved only when a later check confirms a full match.

## Consistency and security
- Organization ID is mandatory in every lookup and mutation.
- Receipt row is locked with `FOR UPDATE` while reconciliation is performed.
- Finding and Outbox notification share one database transaction.
- Outbox payload contains identifiers/classification only, never raw callback body, signatures, destination references, or credentials.
- Queue is bounded (1–200) and sorted by severity then age.
- Financial Core remains the sole ledger authority; no direct balance or journal mutation is exposed.

## Explicit remaining gates
This service is not yet an authenticated HTTP endpoint and does not implement staff assignment, temporal capability checks, dual control, or case-resolution commands. Those require the Identity/Authorization foundation to pass. PostgreSQL live migration/concurrency tests, RLS/runtime-role tests, CI, Web/Android checks and dependency audit must pass before certification.
