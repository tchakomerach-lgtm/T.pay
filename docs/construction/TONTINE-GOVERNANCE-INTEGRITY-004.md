# Community Tontine — governance integrity brick 004

## Delivered in migration 118

- Proposal payload is persisted as a JSON object, rather than only retaining a version and hash.
- The group governance policy starts at version 1 and every update must increment exactly one version.
- Policy scope cannot be moved between organizations or groups.
- Effective timestamps must move forward.
- Proposal identity, type, payload, opening/closing window and all policy snapshots are immutable after opening.
- A finalized proposal cannot be reopened or have its finalization timestamp rewritten.
- The database rejects an open proposal that carries a finalization timestamp.

## Security and correctness boundary

This migration hardens persistence; it does not activate proposal creation, voting, or automatic finalization APIs. Those operations still require authenticated command handlers with active-member checks, idempotency, row-level locking, tenant-scoped transactions, audit and transactional outbox. No vote endpoint or payout is implied by this migration.

## Validation

tests/tontine-governance-schema.test.ts checks the required schema guards. Live PostgreSQL concurrency tests remain a release gate before governance can be enabled for real groups.
