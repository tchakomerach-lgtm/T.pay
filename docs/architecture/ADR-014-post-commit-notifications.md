# ADR-014 — Post-Commit Notifications

## Status
Accepted — S-03.7.

## Decision
Notifications are derived from committed domain events and are never part of the financial transaction. A notification intent is durable, tenant-scoped and independently retryable.

The notification worker executes only after the event is durably committed/publication-ready. Provider success is not financial confirmation. A provider failure leaves the intent unsent and retryable.

Notification delivery is at-least-once. Providers and downstream consumers must tolerate duplicate delivery. The durable identity is the notification intent ID.

## Security
- Default notification content is generic.
- Sensitive financial/KYC/authentication data is not placed in push/SMS/email preview payloads.
- Recipient identity and organization scope are persisted explicitly.
- A shared queue is not a tenant isolation boundary; authorization and tenant scope remain application-controlled.
- No notification worker can post to the Ledger or alter payment/contribution state.

OWASP specifically warns that system notifications can expose sensitive account, financial and authentication data on lock screens and notification-listener surfaces; T.Pay therefore minimizes notification payloads and keeps sensitive detail inside authenticated application views. citeturn0search6

NIST SP 800-61 Rev. 3 emphasizes integrating incident response into broader cybersecurity risk management; notification infrastructure therefore receives durable failure state, retry and observability rather than being treated as a fire-and-forget side effect. citeturn0search2

## Non-goals
No live SMS, email, push or WhatsApp provider credentials are connected in S-03.7. Provider-specific adapters are a later integration gate.
