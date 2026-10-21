# OP-1300/1301 — Outbox delivery and idempotent replay

## OP-1300: transactional outbox dispatcher

- Claims ready rows with `FOR UPDATE SKIP LOCKED` in a short transaction.
- Applies a bounded lease to reduce duplicate concurrent delivery.
- Publishes only after the claim transaction commits.
- Marks successful events as published; retries failures with bounded exponential backoff.
- Quarantines events after the configured attempt limit and redacts common credential patterns from stored errors.
- Delivery is at-least-once, not exactly-once. Every downstream consumer must deduplicate by event ID.

## OP-1301: stable replay version

Idempotent replay previously read the aggregate's current version, which could have advanced after the original command. Migration 103 stores `aggregate_version` on each state event, and the lifecycle repository now returns the exact version from the original event.

## Operational gates

- Apply migrations 101, 102 and 103 in order in a disposable PostgreSQL environment.
- Run `npm run check` and live PostgreSQL integration tests on the exact commit.
- Test two concurrent dispatchers, publisher timeout, process crash after publish, lease expiry, retry exhaustion and consumer deduplication.
- Configure alerts and a controlled operator replay workflow for quarantined rows; do not silently discard dead-letter events.

These components are not production-certified until the above gates are executed and their results are recorded.
