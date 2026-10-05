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

The loop is iterative. A failed test, security gate, CI check, material Bible change, provider-contract change or unresolved high-risk exception sends the brick back to the appropriate earlier stage.

Before every brick, consult docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md and the mandatory domain Bibles/skills mapped there. Do not rely on memory when the repository contains the authoritative rule.

External research is evidence-driven, not decorative. Use primary standards and authoritative documentation when a design decision depends on current security, protocol, regulatory, infrastructure or interoperability guidance. Record only the decision-relevant findings, not private chain-of-thought.

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

Community Tontine remains an independent interoperable domain: daily/weekly/monthly cycles, fixed/variable/goal contributions, membership/roles, beneficiary rotation, governance, partner microfinance selection, multi-channel collection, provider reconciliation, KYC/human payout gates, field continuity and idempotent contribution intents. It never creates a second ledger; T.Pay Financial Core remains authoritative.

## Definition of Done
Code + tests + security controls + observability + documentation + migration/rollback plan when stateful + CI green.

## Settlement Orchestrator state
The settlement construction gate is explicit: contribution idempotency → payment intent → provider adapter → signed callback → freshness/anti-replay → provider validation → atomic financial settlement → versioned fee snapshot → contribution confirmation → receipt/e-carnet → post-commit event/notification → reconciliation. S-02 defines the durable transaction contract; S-02.5 implements the PostgreSQL transaction lifecycle and schema; S-02.5.1 verifies it against live PostgreSQL; S-03.1 establishes the provider boundary; S-03.2 establishes callback authenticity/freshness/replay contracts; L14.3 establishes the versioned schema gate and durable tenant-scoped ingress replay barrier. Next gate: provider-contract activation from signed operator/aggregator schemas, then end-to-end callback-to-settlement integration.


## L14.3 construction rule
Provider-specific production wire formats MUST come from the signed operator/aggregator contract. T.Pay may ship a normalized adapter profile and fail-closed mapping tests, but must not invent undocumented fields, statuses, callback signatures or live endpoints. Callback acceptance order is signature/freshness → schema mapping → durable tenant-scoped replay claim → normalized provider validation → settlement. Same event ID with a different payload hash is a hard security conflict.


## Mobile-money contract activation rule (L14.3+)
T-Money/Mixx by Yas and Moov Money Flooz integrations are contract-bound. Public discovery material is never authoritative for production wire compatibility. A provider adapter can move from DISCOVERY to CONTRACT_REGISTERED only after the current operator/authorized aggregator contract bundle is recorded with version/effective-date/document hashes. Production activation additionally requires sandbox vectors, signature verification vectors, replay/race tests, reconciliation tests, explicit operator approval, secret rotation validation, and CI/security gates. Expired or superseded contracts fail closed. Aggregator callbacks remain external evidence and cannot bypass T.Pay ledger controls.


## L14.4 construction rule — Provider settlement + Revenue Growth
L14.4 extends the provider boundary into a contract registry and the commercial/revenue plane. Provider contracts are tenant-scoped and evidence-bound; activation is fail-closed until the signed contract evidence, validity window, callback schema, signature scheme, currency set and clock-skew policy are present. The settlement path remains: raw-body signature → freshness → versioned schema → tenant replay barrier → payment-intent correlation → exact provider/reference/amount/currency validation → monotonic state transition → serializable atomic settlement → Ledger/fees/contribution/payment/receipt/outbox → reconciliation.

T.Pay also contains a cross-vertical Commercial Agent domain. Every organization can expose sellable offers/services/products; the agent may discover and rank opportunities, prepare/publish offers through permitted channels, qualify leads, schedule follow-ups and optimize campaigns. Autonomous outbound action is bounded by tenant policy, consent, channel allowlists, daily budgets, category restrictions and auditability. Price/contract changes remain human-approved by default. Direct messaging requires explicit consent where applicable; revoked consent is a hard stop. The agent must prefer T.Pay-native marketplace/social opportunities before external channels and must never use purchased/scraped personal data as an implicit permission to contact a person.

The Revenue Growth plane is not a separate money system: successful sales settle through the same T.Pay Financial Core, Payment Intent, Ledger, fee/commission, receipt and reconciliation controls. Offline-first operation, low-bandwidth payloads, SMS/USSD-compatible fallback workflows and local-language offer templates are first-class requirements for Togo/Africa.

## Design Bible implementation state

The global Design Bible implementation contract is recorded in `docs/bibles/TPAY-DESIGN-BIBLE-IMPLEMENTATION.md` and registered as a mandatory baseline. It covers the established DB sequence: Experience OS, universal objects/actions/workflows, real-time experience, organization ecosystem/workspace, People & Teams, Projects & Tasks, Calendar & Meetings, temporal permissions, reservation governance, universal color/token system, Finance & Budget UX, motion system, accessibility, language governance, offline/field mode, AI UX and Togo/Africa readiness.

Frontend construction gate:
DISCOVER -> BIBLE-MAP -> CURRENT-CODE -> DESIGN TOKENS -> SHELL/CONTEXT -> UNIVERSAL STATES -> REALTIME/OFFLINE -> DOMAIN SURFACES -> ACCESSIBILITY/RESPONSIVE -> TEST -> SECURITY REVIEW -> PERFORMANCE/COST -> CI -> RECORD.

Design implementation must reuse existing semantic components and tokens. A new component or interaction requires a repository search first and must not silently create a competing design rule.

## L15 construction rule — AI Core is the central control plane
The AI Core owns model-provider routing and specialist-agent orchestration. No domain agent may embed a direct vendor SDK/API call. Provider adapters are isolated behind a common interface and selected by explicit tenant/data/security/cost policy. OpenAI Responses and Anthropic Messages are supported as replaceable adapters; future providers must conform to the same contract.

The Commercial Growth Agent is a first-class AI Core specialist, not an isolated revenue chatbot. It can reason over approved commercial context and request authorized tools. Its outputs do not directly mutate financial state or silently contact people. Consent, channel policy, outbound budgets, organization scope and human-approval gates are enforced outside the model.

Construction rule: provider outage is not permission to bypass policy. Failover may occur only among providers allowed for the same data classification and tenant policy.

## DB-073 Design Runtime Foundation

DB-073 is implemented on construction branch/PR #80 as renderer-neutral TypeScript contracts because the current repository does not yet contain a browser/mobile renderer. It establishes canonical design tokens, universal component states, realtime/offline invariants, context separation, action contracts, accessibility requirements and the global shell contract. Status remains IMPLEMENTED until exact-head CI and review evidence are available; no UI/production completion claim is implied.
