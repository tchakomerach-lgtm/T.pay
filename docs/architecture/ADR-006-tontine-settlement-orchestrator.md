# ADR-006 — Tontine Settlement Orchestrator

## Decision

The Community Tontine settlement boundary is an orchestration layer, not a second financial core.

Canonical flow:

`contribution intent → payment intent → provider adapter → signed callback → anti-replay → provider validation → atomic financial settlement → fee snapshot → contribution confirmation → receipt/e-carnet → outbox event → notification → reconciliation`.

### Authority

- Tontine owns schedules, membership, contribution intent and operational state.
- Provider adapters own protocol translation and callback verification, never balances.
- Financial Core owns posted money and account state.
- The persistence adapter owns the atomic transaction boundary.
- Receipt/e-carnet is evidence of a committed financial result, never proof by itself.
- Reconciliation is exception detection and investigation; it never silently heals money.

### Provider neutrality

TMoney, Flooz and partner-microfinance integrations implement the same adapter contract. Provider-specific protocol behavior stays inside adapters.

### Idempotency and replay

The contribution idempotency key is copied unchanged to the payment intent and ledger transaction. Provider event IDs must be unique within provider scope and claimed inside the same database transaction as settlement. A failed transaction must release the claim so a legitimate provider retry can succeed.

### Atomic settlement

One database transaction must commit:

1. provider event claim;
2. ledger transaction + lines;
3. fee snapshot;
4. contribution/payment state;
5. receipt/e-carnet record;
6. outbox event.

If any item fails, none is committed.

### Provider failures

- accepted → settle only after signed verified callback;
- pending → remain pending;
- rejected → failed, no ledger post;
- timeout/disappearance → pending + reconciliation;
- duplicate callback → return original receipt;
- amount/currency/payment mismatch → quarantine as reconciliation exception.

### Security gate

Required controls: HMAC signature, timestamp freshness, constant-time comparison, provider/event uniqueness, contribution/payment idempotency, org-scoped authorization, append-only financial records, no raw credential/KYC/payment secret logging.

### Field resilience

Offline collection creates an intent/envelope, never a financial confirmation. Sync reuses the same contribution/payment idempotency key. Agent reassignment preserves contribution identity. Network/provider delay never creates a second payment.

### Future extension

Payout uses the same architecture in reverse: payout intent → provider → signed confirmation → atomic ledger settlement → beneficiary paid → receipt → notification → reconciliation. Rotation and cycle closure occur only after authoritative settlement.


## S-02 durable transaction rule
The settlement implementation now requires a single database transaction around provider-event claim, contribution/payment row locking, ledger idempotency check, ledger append, immutable fee snapshot, state transitions, receipt and outbox enqueue. The financial transaction uses a serializable boundary at this orchestration port; implementations may choose an equivalent stronger locking strategy only when the same invariants are proven. External provider calls are never performed inside this transaction. Serialization conflicts must be retried by the persistence layer with a bounded deterministic policy. Unique database constraints remain the final concurrency barrier. This follows the current OWASP business-logic guidance for atomic check-and-act/idempotency and PostgreSQL transaction/constraint semantics.