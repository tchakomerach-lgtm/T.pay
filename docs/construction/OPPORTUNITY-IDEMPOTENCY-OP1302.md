# OP-1302/1303 — Idempotency request binding and event-version repair

## OP-1302: request binding

- Migration `104_opportunity_idempotency_fingerprint.sql` adds the approval reference and a SHA-256 request fingerprint to lifecycle events.
- The fingerprint binds tenant, organization, opportunity, authenticated actor, actor class, command, approval reference and the approval decision bit. It excludes request IDs and timestamps so a true retry has the same fingerprint.
- A PostgreSQL transaction-scoped advisory lock serializes the same tenant/organization/idempotency key before lookup, preventing concurrent requests from both passing the initial duplicate check.
- A duplicate key returns the stored state/version only when its fingerprint matches. A conflicting reuse throws `OPPORTUNITY_IDEMPOTENCY_KEY_REUSED`, mapped to HTTP 409 at the command boundary.
- Historical rows with no fingerprint use explicit persisted-field comparisons, rather than being accepted unconditionally.
- Unit tests cover exact replay, conflicting opportunity reuse, legacy-row handling and the advisory-lock path.

## OP-1303: event-version repair

Migration `105_opportunity_reconstruct_event_versions.sql` repairs the legacy backfill from migration 103, which had copied the current aggregate version onto each historic event. It assigns a deterministic per-opportunity sequence ordered by `occurred_at, id`.

This reconstruction assumes the event stream contains every aggregate transition. If historical event rows are incomplete, the reconstructed sequence is deterministic but cannot prove the original version number; audit gaps before production use. Migration 103 is kept unchanged to preserve its checksum for databases that may already have recorded it.

## Important remaining security gate

This change prevents request-key confusion but does not make approvals single-use. Approval verification still happens before the lifecycle transaction. A production-grade approval implementation must persist approver identity, separation-of-duties, expiration and decision evidence, and consume the approval atomically with the state transition. Until then, approval enforcement is not production-certified.

## Validation gate

Run `npm run check` on this branch, apply migrations 101–105 in order to a disposable PostgreSQL 17 database, then run the live PostgreSQL integration suite. No test or CI result is implied by this document.
