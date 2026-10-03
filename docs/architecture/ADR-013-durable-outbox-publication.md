# ADR-013 — Durable Outbox Publication

## Status
Accepted — S-03.6.

## Decision
T.Pay persists an event in the same database transaction as the authoritative domain or financial mutation. Publication is a separate post-commit operation.
The outbox is durable evidence that an event must eventually be published. Publisher failure never rolls back committed financial state and never marks the event published.
Delivery is at-least-once. The outbox event ID is the stable delivery identity and consumers must be idempotent.

## Failure model
- DB commit succeeds, publisher fails: record remains unpublished and retryable.
- Publisher succeeds, mark-published fails: duplicate publication may occur; consumer idempotency handles it.
- Worker crashes after claim: lease expiry permits recovery.

## Security
Outbox payloads are untrusted across process/provider boundaries. No secrets belong in event payloads. Publication performs no financial mutation.