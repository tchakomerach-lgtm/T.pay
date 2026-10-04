# T.Pay Construction Rules

## 1. Evidence-based completion
A layer is complete only when its exact head has green CI and required PostgreSQL, concurrency, idempotency, replay, audit, production-adapter, observability and regulatory gates are satisfied. TypeScript compilation alone is never completion evidence.

## 2. One financial truth
Financial Core/Ledger is the only financial source of truth. AI, provider callbacks, offline clients, tontines, school finance, field agents and recovery workflows produce evidence/intents/events and settle through Financial Core. Use immutable entries, compensating transactions and bigint/integer XOF amounts.

## 3. Tenant isolation
Every organization-owned object is tenant scoped. Cross-table relationships use tenant-safe composite foreign keys where applicable. Replays, idempotency keys, sessions, approvals, callbacks and audit records are tenant scoped.

## 4. High-impact AI
Human approval is the default for high-impact financial, identity, credit, access and administrative actions. AI tools require explicit role/risk/organization policy, bounded inputs, idempotency, audit evidence and cannot directly mutate Ledger/payment/credit truth.

## 5. Provider boundary
OpenAI, Anthropic, local models, TMoney, Flooz, PI-SPI and MFI partners are replaceable adapters. Provider callbacks require raw-body verification, freshness, identity/amount/currency/reference validation, replay protection and quarantine for ambiguity. Credentials and regulatory certifications must be real; code cannot manufacture them.

## 6. AI runtime resilience
All external model execution has bounded timeouts, transient-only retries, circuit breakers and cost/rate controls. Fallback is allowed only when the destination route is permitted for the data class. Sensitive and financial data remain local/safety-routed unless an explicitly authorized compliant route exists. Never bypass provider or platform controls.

## 7. Organization access security
Organization access codes are hashed, never stored in plaintext, and protected by tenant-scoped throttling/lockout. Organization audit events are append-only at the database boundary. Access failures never reveal secret material or cross organization boundaries.

## 8. Offline/Africa resilience
Offline state is evidence/intents, never financial truth. Design for intermittent connectivity, low bandwidth, cash-first operations, mobile money, shared devices, USSD/SMS/voice, field-agent continuity, device identity, sequence/replay control, bounded offline windows and conflict quarantine. GPS is evidence, not payment authorization.

## 9. Togo/UEMOA production boundary
Regulated payment, e-money, SFD and credit activities require appropriate licensed/authorized partners and regulatory approvals. T.Pay may build orchestration/evidence before activation, but must not represent unlicensed functionality as live regulated service.

## 10. Durable handoff
Every construction sequence ends in a committed SHA and auditable PR/CI state. A disconnected session does not imply hidden execution. The durable continuation mechanism is GitHub branches/commits/PRs/CI; the next session resumes from the latest exact SHA and earliest unmet gate.

## 11. No false completion
Never mark T.Pay or a layer complete while any mandatory gate remains unverified. Failed, cancelled, missing or stale CI is not green evidence.

## 12. Production readiness
Before production: migrations, rollback strategy, backups/restore, secrets management, rate limits, abuse controls, observability, alerts, incident response, reconciliation operations, disaster recovery and provider contract tests must exist.

## 13. African operating model
Prioritize XOF integer accounting, bilingual/multilingual UX, printable receipts, agent workflows, cash reconciliation, mobile-money confirmation, low-cost devices, power/network interruptions, shared phones/SIM fraud controls and graceful degraded service.

## 14. Platform independence without bypass
T.Pay may use authorized OpenAI, Anthropic or local model adapters when credentials/connectors are available. Architectural replaceability is the solution to vendor limits, not circumvention.

## 15. Definition of Done
1. Exact-head CI green.
2. Typecheck/unit/integration/audit gates green.
3. PostgreSQL race/idempotency/replay proofs where relevant.
4. Production repository/handler boundary.
5. Audit/outbox/observability.
6. Provider contract/operational tests.
7. Regulatory/partner gates where regulated.
8. Documentation states every remaining limitation explicitly.


## Operational observability invariant
- Every production-facing layer must emit durable operational evidence with correlation IDs, bounded payloads and explicit degraded/offline states.
- SLO targets are policy, never proof of achieved production performance.
- Alert delivery failure must never alter Financial Core truth; alerts become queued/retriable operational evidence.
- Africa/Togo deployments must support low-bandwidth escalation paths (SMS/internal queue) without storing provider credentials in application data.
