# T.Pay Opportunity — OP-1293 PostgreSQL Assurance Gate

## New executable boundary

The Opportunity Assurance domain now has a database repository boundary. Domain logic does not execute SQL directly.

### OP-1293
The repository provides:
- tenant + organization scoped claim reads;
- parameterized persistence for claims, evidence and commitments;
- append-only action receipt persistence;
- bounded agent authority persistence;
- explicit transaction execution.

### OP-1294
PostgreSQL trigger enforcement proves action receipts cannot be updated or deleted through normal SQL paths.

### OP-1295
A forced failure after a claim and an action receipt are written proves atomic rollback.

## Field rule

An Opportunity action must never be considered durable until its database transaction commits. If the transaction fails, the whole business action is rejected and the caller must retry through the normal idempotent command path.

## Production gate

This sequence remains incomplete until:
1. live PostgreSQL CI executes with TPAY_DATABASE_URL;
2. API authorization context is wired into the repository boundary;
3. Opportunity lifecycle/state transitions are implemented;
4. realtime event publication is transactionally connected;
5. concurrency and cross-tenant adversarial tests pass.
