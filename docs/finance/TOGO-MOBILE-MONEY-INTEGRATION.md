# Togo Mobile Money Integration — YAS/Mixx, Moov/Flooz and PayGate

Status: integration discovery and contract acquisition. This document is not evidence of a live provider connection.

## 1. Provider routes

### YAS Togo / Mixx
- YAS merchant guidance describes online payment integration for web and mobile applications.
- The merchant presents its company, activity and application/site; requests eligibility, fees and technical documentation; agrees on exchanged data and security, confirmation and refund responsibilities; then tests accepted, declined, interrupted, duplicate, reference and reconciliation cases.
- Obtain the current merchant contract, API specification, authentication method, callback signature scheme, status-query endpoint, refund/cash-out scope, IP allowlist rules, settlement timing and support escalation contacts directly from YAS Business.
- Public information does not provide production credentials or a complete public API wire contract. Do not infer endpoints, headers, payloads, status values or callback signature rules.

### Moov Africa Togo / Flooz
- The official merchant page describes Flooz Corporate merchant acceptance and requires the relevant business/operator card or CFE card with NIF, responsible person's identity document and a signed Corporate subscription contract.
- Moov must supply the current online/API merchant contract and technical specification. A community-maintained public procedure additionally describes merchant onboarding, API documentation supplied by Moov, a web service, static egress IP, joint tests and go-live approval; treat this as secondary guidance and confirm each requirement with Moov.
- Obtain the exact API version, auth mechanism, request/response schemas, callback signing method, status query, refunds/disbursements, IP allowlist, settlement and support procedures from Moov.

### PayGate Global (optional aggregator route)
- PayGate publicly advertises a single integration for Flooz and T-Money in Togo and states that API documentation becomes available in the activated merchant dashboard.
- Its public site currently advertises indicative transaction fees of 2.5% for Flooz and 3% for T-Money. Confirm fees and settlement terms in the signed merchant agreement.
- Do not use a hosted redirect as proof of payment. Verify status server-to-server before any fulfilment or ledger posting.
- Publicly accessible third-party descriptions indicate that callback signature verification may not be available/documented and that webhook configuration is merchant-dashboard controlled. Until PayGate provides a cryptographically verifiable callback contract or another authenticated confirmation mechanism, callbacks must be treated as untrusted signals and must never settle a payment.
- Confirm the actual API version and schemas in the merchant dashboard. Do not copy old examples or undocumented endpoints into production code.

## 2. Required merchant onboarding pack

Prepare and submit through the providers' official business channels:
- Legal entity identity, RCCM/CFE/NIF or other requested business registration evidence.
- Responsible person's identity and authorized contact details.
- T.Pay product description, supported use cases, website/app URLs, return URL and privacy/terms pages.
- Expected monthly volume, average/min/max transaction amount, customer support and dispute/refund process.
- Static outbound IP(s) and HTTPS callback URL once deployed.
- Explicit request for collection (cash-in), payout/disbursement (cash-out), refunds, transaction status lookup, settlement reports, limits, fees, settlement delays and technical support/SLA.
- Signed contract and versioned API documentation. Credentials must be delivered through an approved secret-sharing channel, never email body, source code, GitHub issue or commit.

## 3. T.Pay integration architecture

Keep provider adapters behind the existing Finance Core provider contract:
1. Create a T.Pay payment intent and immutable idempotency key.
2. Validate tenant, actor permissions, currency, amount, limits and business purpose.
3. Call the provider from the server only over HTTPS; enforce hostname allowlisting, TLS validation, timeout, bounded retries and provider-specific rate limits.
4. Persist provider reference and raw response metadata without storing secrets or unnecessary personal data.
5. Treat redirects and browser return URLs as informational only.
6. Verify callbacks according to the signed provider contract. Validate signature over the exact raw body, timestamp/clock skew, event ID, provider identity, amount, currency, payment reference and correlation ID.
7. Persist callback receipt and deduplication key transactionally; reject replays and mismatches.
8. Query provider status server-to-server when callback authentication is unavailable or uncertain.
9. Post ledger entries only after authenticated, authoritative confirmation, using the existing atomic Financial Core settlement path.
10. Reconcile provider statements against T.Pay ledger daily; route differences to an exception queue. Refunds and payouts require separate approvals and idempotency keys.

## 4. Go-live gates

A provider must remain in CONTRACT_PENDING or SANDBOX_VALIDATED until all applicable evidence exists:
- Signed merchant contract and API specification with SHA-256 evidence fingerprint.
- Production endpoint and credential ownership verified; secrets stored in the secret manager.
- HTTPS/TLS and, where required, mTLS or static-IP allowlisting validated.
- Callback authenticity and replay protection independently tested.
- Provider status query validated against successful, failed, pending, expired, reversed and duplicate transactions.
- Exact amount/currency/reference binding and tenant isolation tested.
- Duplicate callback, callback-before-return, delayed callback, network loss and retry tests passed.
- Refund, payout, dispute, settlement and reconciliation semantics documented and tested where contracted.
- Small-value real-device pilot authorized by the merchant and provider; written provider go-live approval recorded.

No provider should be labelled PRODUCTION based only on a successful HTTP request or a mocked test.

## 5. Current T.Pay status and blocking inputs

The repository already contains generic provider contracts, Flooz/T-Money adapter shells, callback schema profiles, provider contract registry and certification gates. The current adapter classes delegate to an injected transport; they are not yet real operator HTTP clients.

Blocking inputs for a real provider implementation:
- YAS/Mixx signed merchant API specification and credentials.
- Moov/Flooz signed merchant API specification and credentials.
- Decision on direct operator contracts, PayGate aggregation, or both.
- Provider callback authentication scheme and test account/phone numbers.
- Approved callback URL and static egress IP for the deployed T.Pay environment.

Until these arrive, keep real-money operations disabled. Continue only with contract-driven transport interfaces, test fixtures explicitly marked as simulations and security tests.
