# OP-1302 — Idempotency request binding

## Change

- Migration `104_opportunity_idempotency_fingerprint.sql` adds the approval reference and a SHA-256 request fingerprint to lifecycle events.
- The fingerprint binds tenant, organization, opportunity, authenticated actor, actor class, command and approval reference. It excludes request IDs and timestamps so a true retry has the same fingerprint.
- A duplicate key returns the stored state/version only when its fingerprint matches. A conflicting reuse throws `OPPORTUNITY_IDEMPOTENCY_KEY_REUSED`, mapped to HTTP 409 at the command boundary.
- Historical rows with no fingerprint use explicit persisted-field comparisons, rather than being accepted unconditionally.
- Unit tests cover exact replay, conflicting opportunity reuse and legacy-row handling.

## Important remaining security gate

This change prevents request-key confusion but does not make approvals single-use. Approval verification still happens before the lifecycle transaction. A production-grade approval implementation must persist approver identity, separation-of-duties, expiration and decision evidence, and consume the approval atomically with the state transition. Until then, approval enforcement is not production-certified.

## Validation gate

Run `npm run check` on this branch, apply migrations 101–104 in order to a disposable PostgreSQL 17 database, then run the live PostgreSQL integration suite. No test or CI result is implied by this document.
