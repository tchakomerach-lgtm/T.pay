# T.Pay Threat Model — initial baseline

## Assets
Identity credentials, organization sessions, financial balances, ledger history, KYC data, documents, AI prompts/context, payment credentials, audit records.

## Primary threats
- Credential theft and session fixation.
- Cross-organization authorization failures.
- Replay/double execution of payments.
- Ledger tampering or unbalanced postings.
- Privilege escalation through organization roles.
- Sensitive-data leakage through logs, AI prompts or documents.
- Fraud through agent/device compromise.
- Webhook spoofing from payment providers.

## Mandatory controls
1. Server-side authorization on every protected command.
2. Organization context must match the active session.
3. Financial commands require idempotency keys.
4. Ledger postings must be balanced and append-only.
5. External webhooks require signature verification and replay protection.
6. Secrets are never committed to Git.
7. Sensitive fields are redacted from logs and telemetry.
8. High-risk financial decisions require human approval unless an explicit policy enables automation.
9. Every privileged action produces an audit event.
10. Security-sensitive dependencies and CI checks are part of release gates.

This is an engineering baseline, not a claim of regulatory certification. Compliance requirements for Togo/WAEMU and each target market must be verified before production launch.
