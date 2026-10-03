# ADR-002 — Transactional Financial Persistence

## Decision

T.Pay financial writes use a database-backed Unit of Work. Ledger posting, idempotency uniqueness and derived account state MUST be committed atomically.

### Non-negotiable invariants

1. Unique key: `(organization_id, idempotency_key)`.
2. Ledger entries are append-only; corrections use compensating entries.
3. Every ledger line belongs to an existing, active, same-currency account.
4. No floating-point arithmetic for money; use integer minor units / bigint at the domain boundary.
5. Account mutations use optimistic concurrency (version) or an equivalent database lock strategy.
6. A financial command either commits all required state or commits nothing.
7. Database constraints are the final concurrency barrier.
8. Replaying the same idempotency key returns the original transaction result; it never creates a second posting.
9. A provider callback can never write directly to the ledger; it must pass through the payment state machine and reconciliation boundary.

## Recommended relational shape

```text
organizations
financial_accounts
ledger_transactions
ledger_lines
payment_intents
provider_events
idempotency_keys
audit_events
```

Suggested constraints:

- `financial_accounts UNIQUE (organization_id, code)`
- `ledger_transactions UNIQUE (organization_id, idempotency_key)`
- `ledger_lines CHECK (amount_minor >= 0)`
- `ledger_lines FOREIGN KEY (transaction_id)`
- `ledger_lines FOREIGN KEY (account_id)`
- organization scoping on every organization-owned row
- immutable/posting timestamps after commit

## Concurrency

Two identical commands may arrive simultaneously from mobile retries, offline sync, provider callbacks or malicious replay.

The application performs an early lookup for UX and latency, but the database unique constraint decides the winner. The losing transaction re-reads the committed result and returns it as a replay.

## Rollback

Any validation failure, account conflict or persistence exception aborts the entire Unit of Work. No partial balance, ledger line or idempotency record may survive.

## Verification

The test suite must cover:

- sequential replay;
- concurrent replay;
- cross-organization same-key isolation;
- duplicate provider event;
- rollback after mid-transaction failure;
- account version conflict;
- compensating reversal;
- reconciliation mismatch.

This design is intentionally provider-neutral so TMoney, Flooz and future providers remain adapters rather than financial authorities.
