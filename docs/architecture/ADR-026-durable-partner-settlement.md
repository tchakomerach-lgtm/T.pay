# ADR-026 — Durable partner settlement boundary

## Decision
T.Pay persists a partner settlement intent separately from the Financial Core. External provider callbacks are evidence that must pass signature, freshness, organization, reference, amount, currency and payload validation before a settlement can advance.

A provider callback never writes the Ledger directly. A validated settlement enters the existing Financial Core settlement boundary; reconciliation mismatches are quarantined and require review.

## African/Togo operating model
- Partner MFI, cash and mobile-money channels may have delayed or duplicated confirmations.
- Offline field operations create a valid gap between collection evidence and provider settlement.
- Provider downtime must not cause duplicate customer charges; idempotency is tenant-scoped.
- XOF amounts use integer minor units and never floating point.
- Low-bandwidth deployments can queue intents and later reconcile them.
- TMoney/Flooz/PI-SPI remain adapters behind the provider boundary; live credentials are deployment configuration, never source code.
- GPS is evidence, never payment authorization.

## Safety
- Callback event IDs are unique per organization/provider.
- Cross-organization references are blocked by composite foreign keys.
- Amount/currency/reference mismatches quarantine rather than mutate financial truth.
- Reversal is an explicit state, never an implicit negative correction.
- No automatic financial correction is permitted from reconciliation.
- Provider credentials/network clients remain outside this brick.

## Remaining work
Provider-specific callback schemas, durable replay-claim integration with the shared callback security boundary, live settlement UoW integration, reversal/refund workflows and production provider certification remain required before live rails.
