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
3. **S-02.5 Real PostgreSQL transaction adapter + transactional persistence schema — implemented.**
4. **S-02.5.1 Live PostgreSQL integration test + migration runner — implemented and verified in CI.**
5. **S-03.1 Provider Adapter Registry + Provider Contract Boundary — implemented.**
6. **S-03.2 Signed callback parser/verification — implemented at security-contract level.**
7. **S-03.3 Provider event validation + durable replay claim hardening — implemented.**
8. **S-03.4 Atomic Ledger + fee + contribution settlement integration — merged to main.**
9. **S-03.5 Receipt/e-carnet evidence hardening — merged to main.**
10. **S-03.6 Durable Outbox / Event Publication — merged to main.**
11. **S-03.7 Post-commit Notification — implemented on construction branch; CI/merge pending.**
12. **S-03.8 Reconciliation exception queue — implemented on construction branch; CI/merge pending.**
13. **S-03.9 Security/concurrency/duplicate-provider tests — implemented on construction branch; CI pending.**

**Current implementation:** S-02/S-02.5/S-02.5.1 establish the durable financial transaction boundary. S-03.1 provides the provider-neutral registry, normalized provider contract, TMoney/Flooz/microfinance contract adapters, bounded retry and circuit-breaker primitives. S-03.2 provides strict signed-callback parsing, exact raw-body HMAC verification, freshness and atomic replay-claim contracts. S-03.3 validates provider identity, payment identity, reference, amount, currency, organization and state before the durable replay claim, and revalidates persisted organization/provider/idempotency context after row locks. S-03.4 adds atomic accounting/evidence consistency gates across the Ledger, fee snapshot, contribution, payment, receipt and outbox. S-03.5 adds cryptographic receipt evidence, deterministic binding, privacy-minimized verification payloads and a DB uniqueness barrier. No live provider credentials or network calls are connected yet. Explicit quarantine persistence and provider-specific schemas remain before live provider integration.

### Layer 6 — Field/offline execution
**L6.1 Signed offline security boundary — implemented on construction branch.**
- signed offline envelopes;
- organization/device binding;
- freshness and clock-skew control;
- monotonic sequence and replay-claim contract;
- synchronization conflict classification;
- privacy-minimized field receipt evidence;
- deterministic field-agent continuity/reassignment plan.

**L6.2 PostgreSQL durable device registry + replay/sequence claims — implemented on construction branch; CI/merge pending.**
**L6.3 Encrypted local queue + synchronization worker — after L6.2.**
**L6.4 Field receipt synchronization and recovery — after L6.3.**

Full Layer 6 exit requires all four substeps plus adversarial concurrency tests and GitHub CI green.

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


### S-03.9 hardening acceptance
S-03.9 adds adversarial proof around the existing settlement boundary: contradictory provider data is rejected before persistence; signed callback replay is rejected; concurrent same-idempotency settlement is constrained to one financial effect; provider-event ownership cannot cross organizations; Ledger idempotency is unique per organization. Live PostgreSQL coverage exercises the durable uniqueness/isolation barriers. No live provider credentials or network calls are introduced by this test brick.

### Next gate after S-03.9
If S-03.9 CI is green, Layer 6 proceeds through L6.1 → L6.2 → L6.3 → L6.4. L6.2 is now implemented on the construction branch and remains blocked from completion until exact-head CI is green and the S-03.9 prerequisite is green/merged.
