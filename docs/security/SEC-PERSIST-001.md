# SEC-PERSIST-001 — Financial Persistence Security Gate

## Security question

**What could become a vulnerability in the persistence layer just introduced?**

### Risk analysis

- **Double posting:** retry, race, offline replay or duplicated webhook.
  - Control: database unique constraint + idempotent command + replay test.
- **Cross-organization leakage:** same idempotency key reused by another organization.
  - Control: uniqueness is scoped by organization and every repository query requires organization context.
- **Partial financial state:** ledger written but balance/idempotency state fails.
  - Control: one database transaction / Unit of Work.
- **Tampering:** historical ledger row modified.
  - Control: append-only permissions, database role separation, audit trail and compensating transactions.
- **Concurrency lost update:** two collectors modify the same account.
  - Control: optimistic version check or serializable/row-lock strategy, selected explicitly per adapter.
- **Provider spoofing:** callback treated as proof of payment.
  - Control: signed webhook verification, replay protection, provider-state validation and reconciliation before ledger posting.
- **Sensitive observability:** account/KYC/payment values leak into logs.
  - Control: redaction and structured telemetry with minimal identifiers.

## Additional anti-vulnerability rule

Security mechanisms themselves must be failure-safe:

- never use a client-supplied "trusted" balance;
- never make a security decision from geolocation alone;
- never make a webhook signature check optional in production;
- never fall back from a failed authorization check to a permissive path;
- never expose internal account identifiers where a public reference is sufficient;
- never log raw KYC documents, secrets, OTPs, tokens or payment credentials.

## Release gate

No production financial adapter is accepted until these invariants are demonstrated by automated tests and a database integration test against the chosen engine.

OWASP ASVS 5.0.0 is the current verification baseline for the application security program. WebAuthn Level 3 is a W3C Recommendation as of 25 August 2026. citeturn1search0turn0search5
