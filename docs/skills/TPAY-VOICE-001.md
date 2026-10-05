# TPAY-VOICE-001 — Voice Fabric Construction Skill

## Purpose
Construire et maintenir la couche vocale T.Pay comme une interface non fiable reliée aux politiques, capacités et services métier.

## Mandatory invariants
- Voice input is untrusted input.
- Caller ID never proves identity.
- Voice biometric comparison is not the sole authenticator for critical actions.
- Voice sessions use short-lived capability leases.
- Tool execution remains behind Tool Fabric and server-side authorization.
- Financial state remains owned by Financial Core.
- Appointment conflicts are enforced transactionally in production.
- Sensitive actions require fresh step-up proof and, where policy requires, human approval.
- Cross-tenant context is forbidden.
- Recording/transcription follows consent, minimization and retention policy.
- Provider webhooks/callbacks require authenticity, freshness and replay protection.

## Construction loop
DISCOVER → BIBLE-MAP → CURRENT-CODE → THREAT-GATE → DESIGN → IMPLEMENT → TARGETED-TEST → SECURITY-TEST → OBSERVE → COST-REVIEW → CI → RECORD.

## Required negative tests
- spoofed caller identity;
- expired session/capability;
- replayed action/challenge;
- cross-tenant appointment access;
- altered transaction parameters;
- missing approval;
- prompt injection in transcript;
- unauthorized tool;
- provider callback replay;
- handoff without capability revocation;
- recording without valid consent where consent is required.

## Production boundary
The in-memory implementation in `packages/ai/src/voice-fabric.ts` is a deterministic domain reference and test oracle. It MUST NOT be presented as the production persistence layer. PostgreSQL constraints/transactions are authoritative for appointments, capabilities, replay barriers and audit state.

## Provider boundary
Realtime/voice vendors are adapters. T.Pay retains:
- organization context;
- identity and authorization;
- policies;
- tool permissions;
- appointment state;
- approvals;
- audit;
- financial execution.

## Cost discipline
- Prefer short-lived sessions.
- Keep context minimal.
- Reuse cached organizational instructions.
- Route low-risk intents to deterministic services before invoking expensive reasoning.
- Escalate to larger models only when policy/quality requires it.
- Stop generation when intent is resolved.
- Record cost per call, model and tool chain.

## Definition of Done
Code + tests + security review + observability + persistence plan + CI green + construction record.
