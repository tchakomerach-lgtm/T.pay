# P038 — Education Sync & State Fabric Construction Record

Date: 2026-10-07
Repository: tchakomerach-lgtm/T.pay
Scope: T.Pay School Bible — Prompt 038 synchronization/resilience foundation.

## References
- AGENTS.md
- docs/bibles/IMPLEMENTATION-MAP.md
- docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md
- docs/skills/TPAY-CONSTRUCTION-001.md
- docs/skills/TPAY-SEC-001.md
- docs/skills/TPAY-AUTH-002.md
- NIST Zero Trust/PQC/DevSecOps
- OpenTelemetry Events

## Decisions
- Sync events are tenant + organization scoped and validated before domain processing.
- Critical education conflicts require human review.
- Device health exposes stale/offline/backlog states.
- Unknown state is preserved; it is never silently converted to failure.
- This layer is domain/reference logic only; it does not mutate Financial Core.

## Tests
- envelope validation
- tenant and organization isolation
- critical conflict gate
- stale/backlog classification
- unknown retry semantics

## Remaining gates
- durable PostgreSQL inbox/outbox and uniqueness constraints
- concurrency integration tests
- API Gateway routes
- encrypted client storage
- Edge Node
- provider adapters
- full CI on exact final commit
