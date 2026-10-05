# L14.3 — Progressive T-Money / Flooz contract activation

## Objective
T.Pay SHALL integrate Togolese mobile-money providers through versioned, contract-bound adapters. It SHALL NOT infer or invent proprietary wire fields, signatures, endpoints, SOAP operations, status values, certificates, IP allowlists, or credentials.

## Evidence boundary
Public evidence confirms that Flooz merchant API onboarding involves a merchant contract and API documentation supplied by Moov Togo, followed by web-service implementation, testing, and production activation. Therefore the repository's normalized callback profile is deliberately non-production until the signed/current provider contract is captured in the private integration registry.

## Activation states
1. DISCOVERY — provider identified; no production traffic.
2. CONTRACT_PENDING — legal/technical documents requested.
3. CONTRACT_REGISTERED — signed contract, API specification, security specification and test credentials recorded.
4. SANDBOX_VALIDATED — contract examples pass schema, signature, replay and settlement tests.
5. PILOT — restricted organization/provider traffic with capped amounts and enhanced reconciliation.
6. PRODUCTION — explicit operator approval and T.Pay release gate.

## Required contract bundle
For each provider/version:
- provider legal entity and service/product identifier;
- API base URLs and environment separation;
- authentication mechanism and credential rotation procedure;
- exact request/response schemas;
- callback/webhook schema;
- signature/MAC algorithm, canonicalization and key lifecycle;
- event identifiers and idempotency semantics;
- status vocabulary and allowed state transitions;
- timestamp/clock-skew rules;
- payment/reference correlation rules;
- amount/currency representation and limits;
- timeout/retry/rate-limit rules;
- reversal/refund semantics;
- TLS/certificate requirements;
- source IP requirements where contractually specified;
- sandbox test vectors;
- support/escalation contacts;
- contract effective date and expiry/review date;
- document hash and evidence location.

## Security gates
Production activation requires:
- raw-body signature verification before parsing;
- constant-time signature comparison where applicable;
- tenant binding;
- replay claim bound to SHA-256 payload;
- payment-intent correlation;
- exact amount/currency match;
- monotonic state-transition validation;
- transactionally atomic settlement;
- durable audit trail;
- reconciliation path for unknown/ambiguous events;
- secret storage outside source control;
- rotation and revocation test.

## Togo rollout
Initial rails: T-Money / Mixx by Yas and Moov Money Flooz.
T.Pay should support direct operator adapters and, where commercially/technically useful, an aggregator adapter. Aggregators are not trusted as ledger authorities: their callback remains external evidence and must pass the same verification/correlation/replay/settlement gates.

## Contract freshness
Every adapter stores contract version, effective date, hash and activation state. Expired or superseded contracts cannot activate production traffic automatically.

## Important non-assumption
Public articles, SDKs, reverse-engineered repositories and aggregator documentation can be used for discovery and test planning, but never become the authoritative production wire contract.