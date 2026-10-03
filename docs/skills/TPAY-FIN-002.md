# TPAY-FIN-002 — Payment Provider and Webhook Integrity

- External providers are adapters; provider payloads never become the internal ledger model.
- Every initiation carries an idempotency key.
- Provider references remain linked to the internal payment ID.
- Webhooks require signature verification, bounded timestamp freshness and replay protection.
- Provider callbacks are untrusted input.
- Webhooks advance state only through the internal payment state machine.
- Provider status never directly edits posted ledger entries.
- Reconciliation produces explicit exceptions instead of silently correcting money.
- Provider credentials stay outside Git and are rotated.

TMoney, Flooz and future providers must use the same adapter boundary; no provider shortcut may bypass authorization, risk, idempotency or ledger posting.
