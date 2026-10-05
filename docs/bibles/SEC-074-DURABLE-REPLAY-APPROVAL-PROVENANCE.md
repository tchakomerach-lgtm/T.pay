# SEC-074 — Durable Replay Barrier, Approval Binding & Security Event Provenance

Status: IMPLEMENTED on `construction/sec-074-durable-security-gates`; integration and exact-head CI remain gated.

## Agent lanes
- Architect: security boundary and monotonic state model.
- Security: replay, approval, provenance, fail-closed semantics.
- Finance: ensure financial mutation cannot bypass the gate.
- AI: ensure future Tool Gateway commands consume the same request digest.
- QA: deterministic, race and negative tests.
- SRE: retention, alerting, redaction and operational evidence.
- Cost: bounded indexes, metadata and event retention.
- Integrator: connect only after every lane's gate is satisfied.

## Controls implemented
1. Durable tenant + JTI replay claim with exact request digest.
2. Reuse of a JTI with a different digest is a hard security conflict.
3. Human approval is tenant-bound, exact-digest-bound, expiring and one-time consumable.
4. Approval consumption is atomic at PostgreSQL level.
5. Security decisions carry policy version/revision, rule IDs and request digest.
6. Security events are append-only by application contract and chained per tenant with previous/event hashes.
7. Credential-like metadata keys are rejected before persistence.
8. Offline authorization remains revalidated at the authoritative boundary; local UI state is not a security decision.

## Critical invariant
A request may never move from `REQUIRE_HUMAN_APPROVAL` to `ALLOW` merely because a UI says "approved". The authoritative store must consume an unexpired approval bound to the exact request digest.

## Integration contract
`runtime decision → exact digest → durable replay claim → approval consumption when required → domain command gate → financial authority gate → security event/outbox`.

The Financial Core and AI Tool Gateway must use this same chain; they must not create parallel authorization state.

## Standards alignment
OWASP ASVS 5.0 is the application-security verification baseline. NIST SP 800-218 v1.1 remains the finalized SSDF reference; the later SP 800-218 Rev.1 v1.2 material remains a public draft, so it is tracked as emerging guidance rather than a normative replacement.

## Field rules
- Agent/device change does not transfer approval or replay state.
- Offline queue stores evidence/intent, not financial truth.
- Reconnect always re-evaluates tenant, capability, temporal permission, replay and approval.
- High-risk field actions require a fresh authoritative decision.
- Security events use UTC timestamps and redacted metadata.

## Completion gate
Not production-ready until:
- exact-head unit/typecheck/build passes;
- PostgreSQL race tests pass where a PostgreSQL test database is configured;
- security review confirms no bypass around domain/AI/finance command gates;
- operational retention/alerting is installed;
- CI evidence is visible for the exact commit.
