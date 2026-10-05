# T.Pay Engineering Operating System

## Mission
Construire T.Pay de façon incrémentale, testable, sécurisée et exploitable sur le terrain. Ce fichier est la mémoire technique persistante du projet.

## Agent team
- architect: architecture, ADR, boundaries
- security: threat modeling, authz, secrets, abuse resistance
- finance: ledger, wallet, payments, credit, commissions, subsidies
- domain: organisation, microfinance, education, marketplace, social, opportunity
- ai: AI Core, tool permissions, evaluation, guardrails
- frontend: UX/UI, accessibility, offline-first, motion
- qa: unit/integration/e2e/property/contract tests
- sre: observability, reliability, backups, incident response
- cost: token/compute/database/API cost optimization

Each agent must touch only its domain, document cross-domain changes, and never bypass security or ledger invariants.

## Construction loop
Every brick MUST execute and respect docs/skills/TPAY-CONSTRUCTION-001.md:

DISCOVER -> BIBLE-MAP -> CURRENT-CODE -> EXTERNAL-RESEARCH -> THREAT-GATE -> DESIGN -> IMPLEMENT -> TEST -> SECURITY REVIEW -> OBSERVE -> COST REVIEW -> CI -> RECORD.

Before every brick, consult docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md and the mandatory domain Bibles/skills mapped there. Do not rely on memory when the repository contains the authoritative rule.

## Coding rules
- Strict TypeScript.
- No floating-point arithmetic for money.
- Idempotency for commands with side effects.
- Append-only financial ledger.
- Server-side authorization.
- Organization context required for organization resources.
- Secrets only through secret stores/environment.
- Redact sensitive data from logs.
- External providers behind adapters.
- AI tools are deny-by-default and policy-controlled.
- Prefer boring, auditable primitives over clever abstractions.

## Free/low-token execution
1. Read repository state before reasoning about implementation.
2. Consult the Bible registry and only the relevant Bibles/skills.
3. Search existing code/docs before creating anything.
4. Batch independent reads/searches.
5. Use small deterministic patches.
6. Reuse shared types and helpers.
7. Avoid regenerating large files.
8. Run targeted tests first, full suite after a coherent batch.
9. Summarize state in AGENTS.md/decision records rather than repeating context.
10. Use local/static validation before expensive external calls.
11. Do not repeatedly reread unchanged Bibles; retain their source/commit reference in the construction record.
12. Never spend tokens explaining work that can be encoded as tests/docs.

## Security baseline
OWASP ASVS 5.0 is the stable application-security baseline. NIST SSDF is used as a secure-development lifecycle reference. WebAuthn Level 3 is a current W3C Recommendation. OpenTelemetry semantic conventions are mandatory for telemetry naming. Recheck release-critical external standards when the relevant source/version changes.

## Secure transport baseline — 2026+
All external/provider adapters MUST be protocol-explicit and fail closed:
- HTTPS with TLS 1.3 is the primary application transport.
- HTTP/3 over QUIC/TLS 1.3 is preferred where supported; fallback may only be HTTPS/TLS 1.3.
- WSS is mandatory for WebSocket transports.
- WebRTC media uses DTLS-SRTP; SIP uses TLS plus SRTP where applicable.
- mTLS is required for service-to-service/provider links whenever the provider contract supports it and risk policy requires it.
- HTTP cleartext, SSL, TLS 1.0/1.1 and silent downgrade are forbidden.
- Provider hostnames are allowlisted; private IP literals are rejected by outbound adapters by default.
- Redirects are not followed automatically for provider calls.
- Provider callbacks require exact raw-body signature verification, freshness and durable replay claims.
- Secrets/certificates never live in source or ordinary database rows; use secret manager/KMS/HSM.
- TLS/protocol selection is a transport property, not an authorization property. Every request still requires tenant context, authorization, capability and idempotency.
- Compatibility exceptions must be isolated to dedicated non-sensitive endpoints and documented; they never weaken the primary security boundary.

## Current construction state
Foundation is implemented for domain types, security sessions/policies, risk controls, audit/telemetry, ledger invariants, wallet/payment/commission primitives, identity/passkey contracts, organization creation, KYC contracts and ledger idempotency. S-02 durable settlement is merged. S-02.5 adds the concrete PostgreSQL transaction adapter and transactional settlement schema. S-02.5.1 adds the live PostgreSQL integration test and migration runner. S-03.1 adds the provider-neutral adapter registry, normalized provider contract, TMoney/Flooz/microfinance contract adapters, bounded retry and circuit-breaker primitives. S-03.2 adds strict signed callback parsing, exact raw-body HMAC verification, freshness and atomic replay-claim contracts. L14.3 adds explicit versioned provider callback schema profiles, a durable tenant-scoped callback replay barrier bound to payload SHA-256, and tenant-scoped provider event uniqueness. Live provider credentials/network clients remain intentionally disconnected until the signed operator/aggregator wire contracts are installed and the remaining settlement integration gates pass.

Community Tontine remains an independent interoperable domain: daily/weekly/monthly cycles, fixed/variable/goal contributions, membership/roles, beneficiary rotation, governance, partner microfinance selection, multi-channel collection, provider reconciliation, KYC/human payout gates, field continuity and idempotent contribution intents. It never creates a second ledger; T.Pay Financial Core remains authoritative.

## Design Bible implementation state
The global Design Bible implementation contract is recorded in `docs/bibles/TPAY-DESIGN-BIBLE-IMPLEMENTATION.md` and registered as a mandatory baseline. Frontend construction must reuse existing semantic components and tokens.

## L15 construction rule — AI Core is the central control plane
The AI Core owns model-provider routing and specialist-agent orchestration. No domain agent may embed a direct vendor SDK/API call. Provider adapters are isolated behind a common interface and selected by explicit tenant/data/security/cost policy. OpenAI Responses and Anthropic Messages are supported as replaceable adapters; future providers must conform to the same contract.

The Commercial Growth Agent is a first-class AI Core specialist, not an isolated revenue chatbot. It can reason over approved commercial context and request authorized tools. Its outputs do not directly mutate financial state or silently contact people.

## L16 construction rule — Voice Fabric
Prompt 020 and `docs/skills/TPAY-VOICE-001.md` define the voice boundary. Voice is an untrusted interface and never an authorization source. `packages/ai/src/voice-fabric.ts` contains the deterministic domain/reference implementation and security invariants.

Voice production adapters MUST keep:
- telephony/media provider behind an adapter;
- all provider HTTP APIs on HTTPS/TLS 1.3; HTTP/3/QUIC is an optimization with HTTPS/TLS 1.3 fallback;
- WSS/WebRTC/SIP transport security explicit;
- provider callbacks signed, fresh and replay-protected;
- session and capability leases short-lived;
- caller ID separate from identity proof;
- sensitive actions behind step-up authentication and policy approval;
- transaction challenges bound to the exact normalized action;
- appointment conflicts enforced by PostgreSQL transaction/constraint;
- transcript/audio privacy and retention policy outside the model;
- financial execution inside Financial Core;
- cross-tenant context impossible by construction.

Voice provider outage is not permission to bypass policy. A failed voice service must degrade to a safe handoff or non-mutating mode.

## Definition of Done
Code + tests + security controls + observability + documentation + migration/rollback plan when stateful + CI green.

## L16.2 current implementation state
L16.2 adds:
- `packages/api-gateway/src/secure-transport.ts`: HTTPS/TLS 1.3 policy, HSTS invariant, provider-host allowlisting, private-IP rejection, HTTPS-only fallback and secure WebSocket URL validation.
- `packages/ai/src/voice-provider-adapter.ts`: provider-neutral PSTN/SIP/WebRTC callback boundary.
- `packages/ai/src/voice-callback-security.ts`: exact raw-body HMAC-SHA256 verification with freshness.
- `packages/ai/src/voice-provider-replay.ts`: durable tenant/provider/event replay barrier bound to payload SHA-256.
- `packages/api-gateway/src/voice-routes.ts`: versioned voice route contract; every mutating route is idempotent and TLS 1.3 transport-bound.
- migration `044_l16_voice_provider_security.sql`: durable callback claims and endpoint policy metadata without provider secrets.
- targeted regression tests in `tests/secure-transport.test.ts` and `tests/voice-provider-security.test.ts`.

Production provider credentials, certificates, real PSTN/SIP/WebRTC clients, PostgreSQL live integration and CI remain gated. No production-readiness claim is made until those checks are verified on the exact final commit.
