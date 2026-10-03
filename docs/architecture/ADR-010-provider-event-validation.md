# ADR-010 — Provider Event Validation and Durable Replay Claim

## Decision

A provider callback becomes eligible for financial settlement only after two distinct gates:

1. authenticity/freshness/replay-envelope verification;
2. server-side payment-event validation inside the settlement boundary.

Validation must bind the provider event to the exact organization, payment intent, provider reference, amount, currency and accepted workflow state held by T.Pay.

The durable replay identity is `(provider,event_id)` and is claimed through PostgreSQL uniqueness inside the same atomic transaction as financial settlement. A duplicate event is not considered a financial replay result unless the organization-scoped ledger idempotency record already proves that the settlement committed.

## Ordering

`verified callback → validation → transaction → row locks → persisted-context validation → durable event claim → ledger idempotency → financial writes`

An invalid event is rejected before its replay identity is consumed.

## Security properties

- cross-provider evidence is rejected;
- cross-organization evidence is rejected;
- payment/reference substitution is rejected;
- amount/currency tampering is rejected;
- pending/rejected events cannot settle;
- concurrent duplicate callbacks are serialized by the database uniqueness barrier;
- a rolled-back settlement does not permanently consume the event claim;
- process-local locks are never authoritative.

## Quarantine

This brick intentionally rejects mismatches without silently repairing financial state. A dedicated durable reconciliation/quarantine queue is the next sub-step so operators can investigate rejected evidence without making it eligible for automatic settlement.

## Evidence

OWASP recommends server-side verification of payment status, matching amount/currency/transaction identity, idempotency and replay protection. PostgreSQL documents `ON CONFLICT`/unique constraints as the database mechanism for atomic conflict handling under concurrency. citeturn1search0turn2search0turn2search3
