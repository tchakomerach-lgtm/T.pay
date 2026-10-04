# ADR-025 — Progressive KYC and credit eligibility

## Decision
T.Pay stores KYC/credit evidence and decisions as a controlled domain separate from the Financial Core ledger. KYC evidence is metadata plus cryptographic evidence references; raw identity documents and biometric payloads are not copied into the ledger.

Credit eligibility is policy-versioned and deterministic. Automatic approval is allowed only for policy-pass cases; KYC gaps, delinquency, high risk and configured review flags route to human review. Rejection and approval decisions carry reason codes and evidence metrics.

## African/Togo operating constraints
- Progressive KYC supports low-connectivity field onboarding and later verification upgrades.
- Mobile-money and cash observations are evidence, not ledger truth.
- Exposure limits must aggregate T.Pay-linked partner relationships where contractual/data-sharing permissions permit it; otherwise the missing view becomes a review condition rather than a false "safe" decision.
- Disbursement remains through the authorized partner/rail. T.Pay does not silently become an e-money issuer.
- Offline field intake must be signed and replay-safe before entering durable KYC/credit workflows.
- Never use GPS alone as identity or credit authorization.

## Security
- Minimize PII and biometric retention.
- Hash evidence and keep provider references instead of raw identity artifacts in the credit domain.
- Version every policy.
- Preserve reason codes for explainability and appeals.
- Default ambiguous cases to human review.

## Remaining work
Durable KYC repository/verification adapters, provider-specific document/liveness integrations, bureau/partner exposure aggregation, full underwriting cash-flow model, disbursement settlement, repayment/recovery, and school-finance orchestration remain separate construction bricks.
