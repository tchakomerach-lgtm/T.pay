# T.Pay Construction Rules

## 1. Completion is evidence-based
- Never declare a layer complete from TypeScript compilation alone.
- A layer is complete only when its defined exit gate is satisfied.
- Exact-head CI must be green; a historical green run on an older SHA is not sufficient.
- PostgreSQL integration and concurrency/race proofs are mandatory for durable state transitions.
- Regulatory authorization, provider credentials, certification, and production access cannot be fabricated by source code or tests.

## 2. Financial truth
- T.Pay has one financial truth: Financial Core / Ledger.
- AI, provider callbacks, offline devices, field agents, tontines, school-finance flows, recovery and web/mobile adapters create evidence, intents, approvals or events; they do not create a second ledger.
- Financial mutations must terminate at the Financial Core boundary.
- Original ledger entries are immutable; corrections use explicit compensating transactions.
- Money uses integer XOF minor units / bigint arithmetic; never floating-point arithmetic.

## 3. Tenant isolation
- Every organization-scoped object must be tenant-scoped in application logic and, where relationships cross tables, protected by composite PostgreSQL foreign keys or equivalent database invariants.
- Replays, idempotency keys, approvals, callbacks and sessions must be tenant-scoped.
- Cross-tenant references must fail at the database boundary, not only in TypeScript.

## 4. High-impact AI
- Human approval is the default for high-impact financial, identity, credit, payout and irreversible organization actions.
- AI tools use explicit allowlists, risk classification, organization scope, bounded inputs/outputs, idempotency and auditability.
- Prompt injection, tool-result poisoning, data exfiltration and instruction-confusion attacks are treated as security events.
- AI cannot directly mutate financial truth outside the Financial Core approval boundary.

## 5. Provider and callback safety
- Provider adapters are replaceable and isolated behind contracts.
- Signed callbacks require exact raw-body verification, freshness, provider identity, amount/currency/reference validation and replay barriers.
- Ambiguous provider events are quarantined; never silently auto-correct the Ledger.
- TMoney, Flooz, PI-SPI and partner-MFI integrations require provider-specific contract/certification tests before production activation.

## 6. Offline-first African operations
- Offline state is evidence/intents, never financial truth.
- Device identity, sequence numbers, replay claims, bounded offline windows and conflict handling are mandatory.
- GPS is evidence for field operations, never payment authorization.
- Field-agent continuity must allow reassignment without losing the client portfolio or audit trail.
- Design for intermittent connectivity, low bandwidth, cash collection, mobile money, USSD/SMS/voice, shared devices, multilingual users and printable/receiptable workflows.

## 7. Security and resilience
- Security scanning is continuous and must cover application, dependencies, database invariants, APIs, provider boundaries, AI tools and operational configuration.
- Use timeouts, bounded retries, circuit breakers, idempotency and safe degradation for external dependencies.
- Secrets never enter source control.
- No test may use fake credentials as evidence of production certification.
- Observability must expose security, financial, provider, AI, offline-sync and reconciliation anomalies.

## 8. Engineering handoff
- Every construction sequence leaves durable Git commits, branch/PR state and an explicit next-step/exit-gate record.
- If a connector cannot perform an operation, use another authorized repository operation (blob/tree/commit, etc.) rather than bypassing security controls.
- Never claim that hidden/background execution continues after a session ends. GitHub is the durable handoff mechanism.
- New heads must be revalidated after every code or workflow change.

## 9. Togo/UEMOA production boundary
- Regulated payment, e-money, microfinance and credit activities require the appropriate licensed/authorized partners and regulatory approvals.
- Architecture must support partner-led operation before direct regulated activation.
- Production launch gates include operational monitoring, reconciliation, incident response, data protection, AML/CFT controls and documented partner responsibilities.

## 10. Definition of done
A layer is marked COMPLETE only when:
1. exact head is green in CI;
2. typecheck, unit tests, audit and relevant PostgreSQL integration tests pass;
3. concurrency/idempotency/replay tests prove the intended invariant;
4. production repository/handler boundaries exist where required;
5. audit/outbox/observability paths are wired;
6. provider-specific contract tests and operational dependencies are satisfied;
7. regulatory/partner gates are explicitly satisfied or the feature remains marked IN PROGRESS.

The construction must continue by fixing the earliest unsatisfied gate rather than skipping it.
