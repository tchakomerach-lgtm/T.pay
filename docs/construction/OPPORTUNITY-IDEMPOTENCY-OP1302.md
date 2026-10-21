# OP-1302–1305 — Idempotency, event versions and human approvals

## OP-1302: idempotency request binding

- Migration `104_opportunity_idempotency_fingerprint.sql` adds the approval reference and a SHA-256 request fingerprint to lifecycle events.
- The fingerprint binds tenant, organization, opportunity, authenticated actor, actor class, command, approval reference and the approval decision bit.
- A PostgreSQL transaction-scoped advisory lock serializes the same tenant/organization/idempotency key before lookup.
- A duplicate key returns the stored state/version only when its fingerprint matches. A conflicting reuse throws `OPPORTUNITY_IDEMPOTENCY_KEY_REUSED`, mapped to HTTP 409.
- Historical rows without a fingerprint use explicit persisted-field comparisons.

## OP-1303: event-version repair

Migration `105_opportunity_reconstruct_event_versions.sql` repairs the legacy backfill from migration 103, which copied the current aggregate version onto each historic event. It assigns a deterministic per-opportunity sequence ordered by `occurred_at, id`.

This reconstruction assumes the event stream contains every aggregate transition. If historical event rows are incomplete, the sequence is deterministic but cannot prove the original version number; audit gaps before production use. Migration 103 remains unchanged to preserve its checksum for databases that may already have recorded it.

## OP-1304: durable approval records

Migration `106_opportunity_approval_records.sql` creates tenant/org-scoped approval records with requester, approver, command, expiry, reason/evidence reference and status. Self-approval is prohibited by both application validation and a database constraint. The repository verifies that the target opportunity belongs to the same tenant and organization.

The verifier permits a `CONSUMED` approval to pass the preflight check only so an exact idempotent retry can reach the repository's duplicate lookup. Any new state transition must atomically consume a still-approved, unexpired record in the same PostgreSQL transaction as the state update. The client-supplied `humanApproval` boolean is not authoritative.

## OP-1305: immutable approval audit

Migration `107_opportunity_approval_audit.sql` adds append-only approval audit events and blocks UPDATE/DELETE on that audit stream. Approval creation and its `APPROVED` audit record are written in one transaction; consumption and its `CONSUMED` audit record are written in the same transaction as the Opportunity lifecycle transition. A failed transition rolls back approval consumption and its audit event together.

## Remaining production gates

- Run `npm run check` and the live PostgreSQL integration suite on this exact branch head.
- Apply migrations 101–107 in order against a disposable PostgreSQL 17 database; test fresh install and upgrade from a database that already recorded migrations 101–103.
- Add concurrency tests proving that only one concurrent request consumes an approval and that a failed transition rolls consumption back.
- Add the authenticated server/API handler and enforce approver permissions at the call site of `recordApproved`; the repository adapter is not itself an HTTP authorization boundary.
- Validate event-chain completeness before treating reconstructed historical versions as authoritative.

No test, CI or production-readiness claim is made until these gates are executed and their outputs are captured.
