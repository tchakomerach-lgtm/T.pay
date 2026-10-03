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

## Loop
DISCOVER -> DESIGN -> IMPLEMENT -> TEST -> SECURITY REVIEW -> OBSERVE -> COST REVIEW -> COMMIT.
Never claim a feature complete without tests and acceptance criteria.

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
2. Search existing code/docs before creating anything.
3. Batch independent reads/searches.
4. Use small deterministic patches.
5. Reuse shared types and helpers.
6. Avoid regenerating large files.
7. Run targeted tests first, full suite after a coherent batch.
8. Summarize state in AGENTS.md/decision records rather than repeating context.
9. Use local/static validation before expensive external calls.
10. Never spend tokens explaining work that can be encoded as tests/docs.

## Security baseline
OWASP ASVS 5.0 is the stable baseline for application verification; bleeding-edge requirements may be tracked separately. WebAuthn Level 3 is a current W3C Recommendation. OpenTelemetry semantic conventions are mandatory for telemetry naming. These external standards must be rechecked when release-critical changes are made.

## Agent registry

The executable role registry is maintained in `docs/agents/registry.yaml`. Specialist agents are bounded by path and veto rules; the integrator must satisfy every gate before merge.

## Current construction state

Foundation is implemented for domain types, security sessions/policies, risk controls, audit/telemetry, ledger invariants, wallet/payment/commission primitives, identity/passkey contracts, organization creation, KYC contracts and ledger idempotency. Next bounded work: persistent account/ledger adapters, payment provider adapters, tontine/microfinance workflows, education finance, then marketplace/social/opportunity/investment and AI Core.

## Definition of Done
Code + tests + security controls + observability + documentation + migration/rollback plan when stateful + CI green.
