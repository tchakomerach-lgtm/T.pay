# T.Pay — Togo/UEMOA Compliance & Interoperability Boundary

## Decision
T.Pay must remain a technology/orchestration platform unless and until each regulated financial activity has the required authorization/partnership. It must not manufacture electronic money merely by exposing a wallet UI. Provider and regulated-institution boundaries are explicit.

## PI-SPI readiness
The payment fabric must support an interoperable instant-payment adapter and provider capability registry rather than hard-coded TMoney/Flooz-only flows. Current BCEAO rules/communications make PI-SPI a central UEMOA payment rail and set phased connection/use requirements; pricing and effective dates must therefore be policy-configurable and versioned, never hard-coded. 

## Togo identity
ANID exposes NIU/VID and authentication-related services. T.Pay identity should use a consented identity-verification adapter, store only the minimum reference/evidence needed, and never copy raw biometric templates into the T.Pay financial database. Identity verification is evidence, not blanket authorization.

## Field reality
- XOF is the default operating currency for Togo deployments, but currency remains explicit.
- USSD/SMS/offline paths must be first-class degraded modes, not afterthoughts.
- Agent operations require low-bandwidth queues, reconciliation and cash-loss controls.
- Fees and limits must be policy/version driven because regional rules can change.
- Cross-border UEMOA flows must use provider capability/risk policy and not bypass regulated rails.
