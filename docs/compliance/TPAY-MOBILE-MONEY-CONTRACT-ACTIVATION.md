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

## Candidate aggregator discovered — PayGate Global (BHK Konsulting SARL)

Public provider materials currently advertise Togo collection for Flooz and T-Money, payment-status notifications, transaction lookup, refunds/transfers, and a merchant dashboard. The public API example shows a payment initiation route, but the complete API documentation is available only after merchant account creation. Public terms identify PayGate Global as an intermediary and require a Togo merchant to be registered, have a website/application, email, RCCM, and a Flooz and/or T-Money merchant account. The terms also allow reserves and disclaim service-continuity guarantees.

Public contact details published by PayGate Global:
- BHK Konsulting SARL, 26 Boulevard de la Kara, Tokoin Forever, Lomé, Togo
- info@paygateglobal.com
- +228 93 70 83 15 / +228 91 36 73 06 / +228 97 93 68 20
- Merchant account: https://www.paygateglobal.com/nouveau-compte
- Public terms: https://www.paygateglobal.com/cgu

This is a lead for contractual onboarding, not evidence that T.Pay has a signed agreement or that PayGate Global is an API-Business PI-SPI participant or BCEAO-licensed payment institution. Before routing live funds, obtain written confirmation of its legal/regulatory capacity, operator mandates, settlement account ownership, safeguarding/segregation arrangements where applicable, refund/reversal liability, fees, reserve rules, data-processing terms, and incident/SLA commitments. Do not infer authorization from its public product page.

The code now contains a `PayGateGlobalAdapter` contract-bound adapter using the existing normalized transport. It deliberately does not hard-code the public example into production: the authenticated merchant dashboard documentation must define the actual request, callback signature, status mapping, refunds, and reconciliation. Register only after a signed aggregator agreement, verified provider mandate, sandbox test vectors, and callback/security certification. The existing `ProviderContractRegistry` accepts `authorized_aggregator_signed` evidence and now rejects invalid/future/expired contract validity windows.

## Onboarding sequence for T.Pay
1. Confirm T.Pay's legal entity, RCCM, CFE and fiscal card; if unavailable, do not submit an application as an incorporated company.
2. Open a merchant account with PayGate Global and request the full current API guide, sandbox, callback signing scheme, IP restrictions, status mapping, refund/reversal rules, limits, and settlement schedule in writing.
3. Separately request merchant terms and API specifications directly from Yas/Mixx and Moov/Flooz if T.Pay needs direct operator connections rather than aggregator routing.
4. Validate all signed terms with counsel and verify the aggregator's authority to route each operator rail.
5. Implement the transport from the authenticated versioned documentation; test callback signature, raw-body verification, replay, amount/reference correlation, double payment, reversal, delayed/unknown status, settlement reports and concurrent ledger posting.
6. Activate a restricted pilot only after all provider and Financial Core gates pass.
