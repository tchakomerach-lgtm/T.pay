# ADR-011 — Atomic Ledger + Fee + Contribution Settlement

## Decision

S-03.4 makes the financial settlement contract executable at the accounting boundary. A verified provider event can settle only when contribution, payment, provider evidence, fee snapshot, receipt and Ledger describe the same organization, identity, currency and gross amount.

All financial/evidence mutations remain in one PostgreSQL transaction. The provider is never allowed to mutate the Ledger directly.

## Accounting

The gross provider-confirmed amount is the transaction total. Fees are represented by an immutable versioned snapshot and, when configured by the Ledger factory, corresponding Ledger allocations. The Ledger must remain balanced.

Fees are never deducted from the provider amount by changing the provider-confirmed gross. Instead, the accounting entries explicitly allocate gross receipt between the underlying tontine liability and fee liabilities/income.

## Concurrency

PostgreSQL row locks, organization-scoped idempotency and the unique provider-event key are authoritative. Process-local state is not authoritative.

Serializable transaction failures and deadlocks are retried from the beginning by the existing PostgreSQL adapter.

## Failure behavior

Failure at Ledger, fee, state transition, receipt or outbox persistence aborts the complete transaction. No provider-event claim survives an uncommitted settlement.

Invalid accounting context is rejected before opening the financial transaction.