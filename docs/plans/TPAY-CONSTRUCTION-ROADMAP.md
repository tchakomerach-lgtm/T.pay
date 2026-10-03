# T.Pay Construction Roadmap — Progressive Field Build

## Permanent execution rule

Every brick follows:

DISCOVER → BIBLE-MAP → CURRENT-CODE → EXTERNAL-RESEARCH → THREAT-GATE → DESIGN → IMPLEMENT → TARGETED-TEST → SECURITY-TEST → OBSERVE → COST-REVIEW → CI → RECORD

The loop is mandatory. A brick cannot be declared complete without the relevant GitHub Actions checks green.

## Layered construction order

### Layer 0 — Engineering control plane
AGENTS, Bible registry, construction skills, CI, cost discipline, security gates, ADR registry and construction records.

**Exit:** reproducible local check + GitHub CI green.

### Layer 1 — Identity, organization and authorization
Passkeys, sessions, RBAC/ABAC, org context, step-up authentication, audit and device lifecycle.

**Exit:** cross-org and privilege-escalation negative tests.

### Layer 2 — Financial Core
Money, accounts, ledger, payment state machine, idempotency, commissions, reconciliation, transactional persistence.

**Exit:** atomic posting, replay safety and concurrency proof.

### Layer 3 — Provider integration fabric
Provider registry, TMoney/Flooz/microfinance adapter contracts, signed webhooks, anti-replay, provider status mapping, timeout/retry policy, circuit breaker.

**Exit:** provider-independent contract tests and quarantine on mismatch.

### Layer 4 — Community Tontine operations
Groups, membership, configurable minimum, schedules, attendance, governance, field-agent continuity, offline intents.

**Exit:** deterministic schedule/field exception tests.

### Layer 5 — Settlement Orchestrator — CURRENT
Contribution intent → payment intent → provider adapter → signed callback → anti-replay → provider validation → atomic Financial Core settlement → fee snapshot → confirmation → receipt/e-carnet → event/outbox → notification → reconciliation.

**Sub-steps:**
1. Payment intent and identity propagation.
2. Durable Financial Settlement UoW — implemented as the S-02 orchestration boundary.
3. **S-02.5 Real PostgreSQL transaction adapter + transactional persistence schema — implemented at adapter/schema level.**
4. Live PostgreSQL integration test and migration runner.
5. Provider adapter registry.
6. Signed callback parser/verification.
7. Event uniqueness and transactional claim.
8. Atomic ledger + fee + contribution settlement.
9. Receipt/e-carnet evidence.
10. Outbox/event publication.
11. Notification after commit.
12. Reconciliation exception queue.
13. Security/concurrency/duplicate-provider tests.

**Current implementation:** S-02 provides the durable settlement contract; S-02.5 provides executable PostgreSQL transaction lifecycle, row-lock SQL, idempotency/uniqueness constraints, exact monetary storage, receipt and outbox persistence schema. A live-PostgreSQL integration test and production migration runner remain before provider integrations are treated as production-ready.

### Layer 6 — Field/offline execution
Signed offline envelopes, device binding, route reassignment, sync conflict resolution, local encrypted queue, idempotent replay, field receipts.

### Layer 7 — Payout and beneficiary rotation
Payout intent, KYC/human approval, provider settlement, ledger posting, beneficiary paid transition, rotation fairness rules, payout receipt.

### Layer 8 — Cycle closure and reconciliation
Open → settlement_pending → closed, unresolved-work gate, provider/internal reconciliation, exception workflow, pause/resume.

### Layer 9 — Microfinance integration
Client accounts, agent collection, partner selection, cash/mobile-money flows, commissions, school financing and credit.

### Layer 10 — Organization OS
ERP/CRM/documents, portals, recruitment, marketplace, social network, communications and dashboards.

### Layer 11 — AI Core
API gateway, policy enforcement, orchestrator, specialized agents, tool permissions, audit, cost budgets and human approval gates.

### Layer 12 — Product surfaces and scale
Web/mobile/USSD, accessibility, field mode, observability, SRE, performance, backups, disaster recovery, migrations and service extraction only when justified.

## Construction record rule

For every substantial layer record:
- consulted Bibles/ADRs/skills;
- external sources and versions;
- threat-gate result;
- tests;
- CI result;
- commit;
- remaining risks.

The roadmap is a sequencing control, not a second product specification. Domain Bibles remain authoritative.
