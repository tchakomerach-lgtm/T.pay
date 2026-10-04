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


### S-03.9 hardening acceptance
S-03.9 adds adversarial proof around the existing settlement boundary: contradictory provider data is rejected before persistence; signed callback replay is rejected; concurrent same-idempotency settlement is constrained to one financial effect; provider-event ownership cannot cross organizations; Ledger idempotency is unique per organization. Live PostgreSQL coverage exercises the durable uniqueness/isolation barriers. No live provider credentials or network calls are introduced by this test brick.

### Layer 6 execution status
L6.1 signed offline boundary and L6.2 durable PostgreSQL device/replay claims are implemented. L6.3 encrypted local queue + bounded synchronization is implemented on the construction branch. L6.4 field receipt synchronization/recovery remains before Layer 6 exit.

### L9.3 KYC / credit eligibility
L9.3 adds progressive KYC evidence metadata, policy-versioned credit applications/decisions, deterministic exposure and debt-service checks, and human-review gates for ambiguous/high-risk cases. It does not store raw biometrics in the ledger and does not authorize T.Pay to issue stored value or disburse outside an authorized partner.

### L9.2 durable collection/reconciliation
L9.2 adds durable tenant-scoped collection intents, cash sessions/movements, deterministic cash reconciliation, exception-first mismatch handling and a PostgreSQL repository. No mismatch can directly correct the Financial Core. The branch remains unmerged until CI is green.

### Current progression
Layer 6 is complete. Layer 7 payout foundation and Layer 7.1 reconciliation/reversal safety are merged; Layer 7 remains IN PROGRESS. Layer 8 closure safety gates are merged; Layer 8 remains IN PROGRESS. Layer 9 microfinance integration foundation is merged; L9.2 durable collection/cash reconciliation is implemented on the construction branch. L9.3 KYC/credit eligibility is implemented on the construction branch. L9.4 durable partner settlement is implemented on the construction branch. Layer 9 remains IN PROGRESS until live-provider integration, repayment/recovery, recovery-to-Ledger integration and production school-finance delivery are completed.


### L9.4 durable partner settlement
L9.4 persists partner settlement intents and provider callback evidence with tenant-scoped idempotency, composite organization boundaries, deterministic state transitions and quarantine-first reconciliation. It deliberately stops before production provider credentials, provider certification and live network calls.

### L9.5 school finance orchestration
L9.5 adds durable school-finance requests, separate tuition/supply expense evidence, configurable recovery rules, parent-bound recovery intents and lifecycle controls. It does not bypass partner-MFI underwriting or the Financial Core settlement boundary.
