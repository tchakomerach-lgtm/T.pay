# ADR-024 — Provider Callback Ingress Gate

## Status
Accepted for L14.3.

## Decision
T.Pay separates provider callback handling into: exact raw-body signature verification; explicit versioned provider wire-schema mapping; durable tenant-scoped replay claim keyed by (organization_id, provider, event_id) and bound to the SHA-256 payload hash; then normalized event validation and financial settlement.

A callback is evidence, never a ledger instruction.

## Togo provider rule
Public material confirms Flooz merchant API access is contract-controlled and that the operator supplies API documentation after merchant onboarding. T.Pay therefore does not invent undocumented production wire fields or statuses. Profiles in code are placeholders for the signed operator/aggregator contract and must be activated only after contract verification.

## Security consequences
- Cross-tenant replay is prevented by the durable composite key.
- Same event ID with a different payload is a hard conflict.
- Unknown statuses fail closed.
- Settlement keeps a second durable idempotency barrier.
- Live credentials remain disabled until provider contracts are installed and verified.

## Acceptance
- Parser negative tests pass.
- Replay tests cover duplicate, payload conflict and cross-tenant isolation.
- Migration changes provider event uniqueness to tenant scope.