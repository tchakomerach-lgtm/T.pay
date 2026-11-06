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

## Current construction state
Foundation is implemented for domain types, security sessions/policies, risk controls, audit/telemetry, ledger invariants, wallet/payment/commission primitives, identity/passkey contracts, organization creation, KYC contracts and ledger idempotency. S-02 durable settlement is merged. S-02.5 adds the concrete PostgreSQL transaction adapter and transactional settlement schema. S-02.5.1 adds the live PostgreSQL integration test and migration runner. S-03.1 adds the provider-neutral adapter registry, normalized provider contract, TMoney/Flooz/microfinance contract adapters, bounded retry and circuit-breaker primitives. S-03.2 adds strict signed callback parsing, exact raw-body HMAC verification, freshness and atomic replay-claim contracts. L14.3 adds explicit versioned provider callback schema profiles, a durable tenant-scoped callback replay barrier bound to payload SHA-256, and tenant-scoped provider event uniqueness. Live provider credentials/network clients remain intentionally disconnected until the signed operator/aggregator wire contracts are installed and the remaining settlement integration gates pass.

Community Tontine remains an independent interoperable domain: daily/weekly/monthly cycles, fixed/variable/goal contributions, membership/roles, beneficiary rotation, governance, partner microfinance selection, multi-channel collection, provider reconciliation, KYC/human payout gates, field continuity and idempotent contribution intents. It never creates a second ledger; T.Pay Financial Core remains authoritative. TONTINE-ROTATION-PAYOUT-001 now implements deterministic beneficiary rotation, confirmed-contribution net-pool calculation from immutable fee snapshots, beneficiary payout gates, provider-bound payout initiation, and additive PostgreSQL persistence for groups/memberships/cycles/schedules/beneficiary slots. The brick remains fail-closed pending durable repository adapters for the new aggregates, payout callback settlement integration, incident/dispute/refund persistence, offline end-to-end coverage and green CI.

## Design Bible implementation state
The global Design Bible implementation contract is recorded in `docs/bibles/TPAY-DESIGN-BIBLE-IMPLEMENTATION.md` and registered as a mandatory baseline. Frontend construction must reuse existing semantic components and tokens.

## L15 construction rule — AI Core is the central control plane
The AI Core owns model-provider routing and specialist-agent orchestration. No domain agent may embed a direct vendor SDK/API call. Provider adapters are isolated behind a common interface and selected by explicit tenant/data/security/cost policy. OpenAI Responses and Anthropic Messages are supported as replaceable adapters; future providers must conform to the same contract.

The Commercial Growth Agent is a first-class AI Core specialist, not an isolated revenue chatbot. It can reason over approved commercial context and request authorized tools. Its outputs do not directly mutate financial state or silently contact people.

## L16 construction rule — Voice Fabric
Prompt 020 and `docs/skills/TPAY-VOICE-001.md` define the voice boundary. Voice is an untrusted interface and never an authorization source. `packages/ai/src/voice-fabric.ts` contains the deterministic domain/reference implementation and security invariants.

Voice production adapters MUST keep:
- telephony/media provider behind an adapter;
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


## L16.1 current implementation state
Prompt 020 Voice Fabric is now present in `packages/ai/src/voice-fabric.ts`, with targeted regression coverage in `tests/voice-fabric.test.ts`. Migration `043_l16_voice_fabric.sql` adds durable voice sessions, capability leases, transaction challenges, consent/security metadata, media metadata and a PostgreSQL GiST exclusion constraint preventing overlapping confirmed appointments per organization/resource. The implementation record is `docs/construction/L16-VOICE-FABRIC-RECORD.md`.

The production gate remains fail-closed until provider-specific telephony contracts, signed callback/replay controls, PostgreSQL concurrency integration tests, API Gateway routes, media retention workers, end-to-end voice red-team tests and CI green are verified. No production readiness claim is made from the domain/reference implementation alone.

## Independent Tontine durability / reconciliation state
The independent Community Tontine now has durable PostgreSQL repositories in `packages/microfinance/src/tontine-repositories.ts`, including transaction-scoped beneficiary claiming and cycle-scoped uniqueness. Migration `045_tontine_durability_callbacks.sql` adds a durable provider callback replay barrier. `packages/microfinance/src/tontine-provider-callback.ts` verifies a normalized provider callback through the existing provider boundary, binds it to the exact payout/amount/currency, persists the receipt, and delegates the actual financial settlement through an injected Financial Core bridge.

Field continuity is implemented as signed, expiring, monotonic-sequence offline operations in `packages/microfinance/src/tontine-offline.ts`. Offline operations are operational intents only: they cannot mutate the ledger. Migration `046_tontine_offline_operations.sql` persists the reconciliation queue. Incident/dispute/recovery/refund state machines and persistence are added by `packages/microfinance/src/tontine-case.ts` and migration `047_tontine_cases_refunds.sql`; refunds remain Financial Core responsibilities.

This sequence is not production-complete until PostgreSQL live/concurrency tests, signed provider callback integration tests, offline end-to-end reconciliation, incident/refund integration, full CI and migration execution are green.
Governance, community commerce and intelligence are now represented by `tontine-governance-policy.ts`, `tontine-economic-network.ts`, `tontine-intelligence.ts` and migrations `048_tontine_economic_intelligence.sql` / `049_tontine_governance.sql`. Intelligence remains advisory and evidence-bound; commerce never merges its operational state with the financial ledger; governance changes are versioned and quorum-controlled.


## P056 school classes and enrollment API
Migration `115_education_classes_enrollments.sql` and authenticated class/enrollment endpoints are under review on `feat/education-classes-enrollments-api-001`. Read access requires `org.read`; writes require `org.manage`. PostgreSQL owns tenant-safe class/student/actor relationships, one-active-enrollment uniqueness and atomic class-capacity admission. No school endpoint may write fees or ledger state; all financial operations remain in Financial Core. See `docs/construction/P056-EDUCATION-CLASSES-ENROLLMENTS.md`. This brick is not validated until exact-head CI and the live PostgreSQL concurrency test are green; PR remains draft.


## P056.3.1 — temporal permission grant lifecycle (under validation)
- Branch: `feat/p056-3-temporal-grant-lifecycle`.
- Adds organization-scoped GET/POST/PATCH APIs for grant history, grant creation and revocation.
- Mutations require `security.manage` plus a step-up session; target actor must be active in the same tenant/organization.
- Migration 123 stores revocation actor/reason and grants runtime actor lookup; actor queries remain explicitly tenant/organization scoped. Full actor-table RLS waits for P057 to bind verified tenant context into the session contract.
- Grant mutation, audit and idempotency completion share one PostgreSQL transaction. No security-grant details are emitted to the general School SSE stream.
- Remaining gates: run exact-head PostgreSQL 17 tests; prove with a dedicated non-owner/non-superuser/NOBYPASSRLS API login; add rollback/concurrency/replay assertions; run full CI, Web build, Android build and terrain verification. No certification or merge.


## P057.1 — tenant-bound identity session foundation (under validation)
- Branch: `feat/p057-1-tenant-bound-sessions`, stacked on the open P056.3.1 PR #159; not merged.
- Migration 124 adds tenant_id to api_devices/api_sessions, backfills only from education_actors, revokes unresolved legacy sessions, and adds tenant-scoped indexes.
- Bearer format is `tpay1.<tenantId>.<high-entropy-secret>`; the tenant segment is an untrusted routing claim and the complete bearer hash must match the persisted session row.
- Device/session repository operations bind tenant, actor, device and trust_epoch. API actor lookup independently verifies tenant and organization against the session claim.
- This is P057.1 only. Session/device runtime RLS, dedicated least-privilege database role, session refresh/revocation API, passkey challenge persistence/counter checks, recovery, rate limiting and terrain validation remain open.
- Existing unbound bearer sessions are intentionally rejected; migration revokes only legacy sessions whose tenant cannot be resolved. Reauthentication is required for unbound tokens.


## P057.2 — identity session runtime RLS (under validation)
- Migration 125 enables and forces tenant-scoped RLS on api_devices and api_sessions.
- Production session validation uses one transaction, SET LOCAL ROLE tpay_school_runtime, tenant GUC, SELECT locks and a constrained last_seen_at update.
- API actor/permission lookup now executes under the same least-privilege role and verified tenant/organization predicates.
- Deployment prerequisite: the API login must be a non-owner, non-superuser, NOBYPASSRLS role with explicit membership in tpay_school_runtime. No merge until live PostgreSQL proves the effective role and cross-tenant denial.
