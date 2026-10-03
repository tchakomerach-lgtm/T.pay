# ADR-007 — PostgreSQL Durable Settlement Persistence

## Status
Accepted for S-02.5.

## Decision
T.Pay's durable settlement contract is backed by a concrete PostgreSQL transaction adapter and a versioned relational schema. The adapter owns BEGIN, COMMIT, ROLLBACK, isolation selection and bounded retry of transient serialization/deadlock failures.

The provider network is never called through this adapter. Provider calls happen before the transaction; verified provider events enter the transaction as authenticated but still untrusted business facts.

### Atomic settlement boundary

The following operations execute in one PostgreSQL transaction:

1. provider event claim;
2. contribution/payment row locks;
3. ledger idempotency lookup;
4. ledger transaction and lines;
5. immutable fee snapshot;
6. contribution/payment transitions;
7. receipt;
8. outbox enqueue.

A failed operation rolls back the complete set. A serialization failure or deadlock restarts the complete transaction from the beginning with a bounded retry policy.

### Database invariants

- (organization_id, idempotency_key) is unique for financial commands.
- (provider, event_id) is unique for provider callbacks.
- ledger lines are append-only through application ownership and FK constraints.
- ledger lines reference an existing financial account.
- monetary minor units are stored as exact numeric(38,0) and mapped to bigint at the TypeScript boundary.
- organization context is carried on every organization-owned settlement row.
- receipt uniqueness prevents multiple receipts for one contribution/payment.
- outbox rows are durable and publishable after commit.
- no trigger or outbox consumer mutates the ledger.

### Why PostgreSQL

PostgreSQL provides transaction blocks, serializable isolation, row-level FOR UPDATE locks, unique constraints and foreign keys. FOR UPDATE protects contribution/payment rows against concurrent writers until transaction end, while unique constraints remain the final concurrency barrier. citeturn0search0turn0search4

Serializable transactions can fail with SQLSTATE 40001; deadlocks can fail with 40P01. The adapter retries the complete transaction only for these transient conditions and never retries ordinary validation or business failures. citeturn0search24

### Migration policy

The migration is additive and creates the minimum persistence boundary required by S-02.5. It must be applied through a migration runner in deployment, never by application startup.

Rollback is forward-only for financial schema: do not drop financial tables automatically. A failed deployment stops before enabling dependent writes. Data-destructive rollback requires an explicit reviewed migration.

### Security consequences

The database is now part of the financial trust boundary. Database credentials must remain outside Git and be least-privileged. The application role must not receive unrestricted DDL privileges in production. Cross-organization queries always include organization_id predicates. Future RLS may add defense in depth but does not replace application authorization.

### Deferred

- real pg Pool/driver wiring in an application runtime;
- production migration runner;
- provider adapters;
- durable outbox dispatcher;
- full integration test against a real PostgreSQL instance in CI.
