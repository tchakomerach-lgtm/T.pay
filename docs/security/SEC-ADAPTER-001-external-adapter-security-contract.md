# T.Pay External Adapter Security Contract — SEC-ADAPTER-001

Status: mandatory integration contract; an adapter is not production-enabled until its provider-specific certification and evidence are attached.

## Security boundary

All external providers (mobile money, banks, insurers, identity/KYC, messaging, storage and AI) are accessed only through a typed T.Pay adapter behind the API Gateway / owning domain service. Domain modules MUST NOT hold provider credentials, call provider endpoints directly, or accept provider status as authoritative financial settlement.

## Transport and identity

- HTTPS only; TLS 1.3 minimum for T.Pay endpoints. Reject plaintext HTTP and invalid certificates.
- Use mutual TLS where the provider supports it; otherwise use provider-approved OAuth 2.0 client credentials or signed request authentication with least-privilege scopes.
- Pin provider trust roots only where operationally supportable; support controlled certificate rotation and overlap.
- Keep credentials in a managed secret store, never in source, mobile bundles, logs, build artifacts or database rows readable by tenant users.
- Separate credentials, endpoints and signing keys by environment and provider account. No production credential in CI or debug builds.

## Message integrity and replay resistance

- Verify callback signatures against the provider-specific canonicalization rules before parsing business effects.
- Enforce timestamp tolerance, nonce/event uniqueness and durable replay protection.
- Require idempotency keys for every mutating outbound command; persist request hash, provider reference and terminal result.
- Reject mismatched hashes, duplicate event IDs with different payloads, invalid currency/amount/reference, expired timestamps and unknown provider accounts.
- Use constant-time signature comparison and bounded request/body sizes.

## Financial authority

- Provider HTTP 2xx or a provider-reported "completed" status is not settlement.
- Payment flow: domain intent -> adapter request -> authenticated signed callback/query -> anti-replay verification -> Financial Core atomic settlement -> immutable audit/outbox -> reconciliation.
- Only Financial Core may post the ledger. Adapter code must never write ledger tables.
- Unknown, delayed, duplicated or contradictory provider states remain pending/exception and enter reconciliation; never auto-mark paid.
- Refunds, reversals and payouts require separate idempotent commands and explicit policy/approval.

## Isolation and authorization

- Bind each adapter operation to authenticated actor, tenant, organization, domain object and purpose.
- Resolve provider account from server-side configuration; never trust client-supplied provider IDs or destination account.
- Enforce tenant-scoped queries/RLS and least privilege. Super Admin does not receive implicit tenant data access.
- Separate maker/checker identities for high-risk payout, refund, insurance activation and credential rotation.
- Do not send personal or KYC data unless the provider contract and purpose explicitly require it; minimize and redact payloads.

## Operations and failure handling

- Use bounded connect/read timeouts, retry only transient failures with exponential backoff and jitter, and preserve the same idempotency key across retries.
- Circuit-break unhealthy providers; apply rate limits, concurrency caps and queue back-pressure.
- Store correlation IDs and redacted structured audit records. Never log bearer tokens, secrets, full card/payment credentials, KYC documents or raw signatures.
- Monitor callback lag, signature failures, replay attempts, reconciliation gaps, provider availability and credential expiry.
- Provide kill switch per provider/account and fail closed when configuration, trust material or verification is unavailable.

## Release gates

An adapter stays DISABLED until all are evidenced: signed provider contract; sandbox and production credentials provisioned outside Git; callback signature test vectors; TLS/certificate rotation test; replay/idempotency tests; tenant-isolation and RLS tests; timeout/retry/circuit-breaker tests; reconciliation proof; provider certification; operational runbook and rollback/kill-switch test.

## CT-042 insurance boundary

T.Pay and a microfinance partner are workflow/intermediation and control participants, not insurers or guarantors. Insurance remains optional and disabled until a licensed insurer, policy wording, premium payer/consent record, approval path, signed provider evidence and accounting mapping are validated. No premium collection or insurance ledger posting may be inferred from a draft proposal.

## Current implementation rule

Documentation does not certify an adapter. Provider integrations without the evidence above MUST remain explicitly disabled and be reported as non-production.
