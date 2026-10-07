# P038 — Education Sync & State Fabric Construction Record

Date: 2026-10-07
Repository: tchakomerach-lgtm/T.pay
Scope: T.Pay School Bible — Prompt 038 synchronization/resilience foundation.

## Authoritative references
- AGENTS.md @ 1225118e49f0e6fd039f8aedbd8820d10a11ec4b
- docs/bibles/IMPLEMENTATION-MAP.md @ 1225118e49f0e6fd039f8aedbd8820d10a11ec4b
- docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md @ 1225118e49f0e6fd039f8aedbd8820d10a11ec4b
- docs/skills/TPAY-CONSTRUCTION-001.md @ 1225118e49f0e6fd039f8aedbd8820d10a11ec4b
- docs/skills/TPAY-SEC-001.md @ 1225118e49f0e6fd039f1c4ddb5b6f59c303bcf82
- docs/skills/TPAY-AUTH-002.md @ 1225118e49f0e6fd039f1c4ddb5b6f59c303bcf82
- External: NIST Zero Trust, NIST PQC/crypto-agility, NIST DevSecOps, OpenTelemetry Events.

## Design decisions
- Event envelopes are tenant and organization scoped and validated before domain processing.
- Critical conflicts require human review; no generic last-write-wins for sensitive education state.
- Device health is explicit so stale/offline/backlogged devices are visible.
- Idempotency and replay barriers remain mandatory; this module does not mutate Financial Core directly.
- Unknown state is preserved instead of being collapsed into failure.

## Security gate
Fail closed on malformed envelopes, cross-tenant context, invalid sequence/schema/hash/idempotency metadata and critical auto-resolution attempts.

## Tests
- Envelope validation
- Tenant/organization isolation
- Critical conflict gate
- Device stale/backlog classification
- Unknown retry semantics

## External research consequences
NIST Zero Trust reinforces explicit identity/resource authorization rather than network trust. NIST's 2026 PQC guidance requires crypto-agility and migration planning. OpenTelemetry's event model supports explicit occurrence timestamps and structured event attributes. These inform the boundary but do not override T.Pay policy.

## Remaining gates
- PostgreSQL durable inbox/outbox and uniqueness constraints
- concurrent integration tests
- API Gateway routes
- encrypted local storage implementation in mobile/web clients
- Edge Node
- provider/webhook adapters
- full CI verification on this exact commit
