# T.Pay Construction Rules

## 1. Evidence-based completion
A layer is complete only when its exact head has green CI and all applicable PostgreSQL, concurrency, idempotency, replay, audit, production-adapter, observability, security-evaluation and regulatory gates are satisfied. TypeScript compilation alone is never completion evidence.

## 2. One financial truth
Financial Core/Ledger is the only financial source of truth. AI, provider callbacks, offline clients, tontines, school finance, field agents and recovery workflows produce evidence/intents/events and settle through Financial Core.

## 3. Tenant isolation
Every organization-owned object is tenant scoped. Cross-tenant access is denied by default and tested at repository/service/API boundaries.

## 4. High-impact AI
Human approval is the default for high-impact financial, identity, credit, access and administrative actions. AI tools require explicit role/risk/organization/purpose policy, bounded inputs, idempotency and audit evidence. AI cannot directly mutate Ledger/payment/credit truth.

## 5. AI source-to-sink invariant
Untrusted documents, messages, tool results, retrieved text and external APIs are DATA. They cannot become instructions or authorization. Any path from untrusted source to consequential sink must cross a deterministic policy gate with validated structured data.

## 6. AI capability invariant
Capabilities are deny-by-default, short-lived, least-privilege and scoped to agent, tenant, actor, purpose, tool and data class. Agents cannot mint, widen, delegate or self-approve capabilities.

## 7. AI tool risk invariant
L0 low-risk read may be autonomous; L1 sensitive read is policy-gated; L2 reversible writes require policy/idempotency; L3 external communication requires consent/approval; L4 high-impact actions require independent authorization and human approval by default; L5 root trust/ledger-root/security bypass is not directly executable by AI.

## 8. Approval binding invariant
A consequential approval must bind to the canonical action/payload hash, tenant, actor, purpose, risk class and expiry. Any material change invalidates the approval.

## 9. Provider boundary
OpenAI, Anthropic, local models, TMoney, Flooz, PI-SPI and MFI partners are replaceable adapters. Provider selection never grants additional authority or bypasses policy.

## 10. AI runtime resilience
External model execution has bounded timeouts, transient-only retries, circuit breakers and cost/rate controls. Fallback is allowed only when the destination route is permitted for the same data class and tenant policy.

## 11. Offline/Africa resilience
Offline state is evidence/intents, never financial truth. Design for intermittent connectivity, low bandwidth, cash-first operations, mobile money, shared devices, USSD/SMS/voice, field-agent continuity and replay/conflict control.

## 12. Togo/UEMOA production boundary
Regulated payment, e-money, SFD and credit activities require appropriate licensed/authorized partners and regulatory approvals.

## 13. Durable handoff
Every construction sequence ends in a committed SHA and auditable PR/CI state. Conversation/session boundaries do not imply hidden execution.

## 14. No false completion
Never mark T.Pay or a layer complete while any mandatory gate remains unverified. Planned, implemented, verified, integrated, production-ready and live are distinct states.

## 15. TASS and security-evaluation gate
TASS and adversarial AI evaluations are evidence generators. Critical unresolved findings block release. TASS cannot modify its own rules, disable CI, or self-approve exceptions.

## 16. Supply-chain and secrets
No secrets in Git, prompts, client bundles or business records. CI uses least privilege. Releases should produce SBOM/provenance evidence where supported. Dependency and secret scanning are mandatory release evidence.

## 17. Definition of Done
1. Exact-head CI green.
2. Typecheck/unit/integration/security tests green.
3. PostgreSQL race/idempotency/replay proofs where relevant.
4. Production repository/handler boundary.
5. Audit/outbox/observability.
6. Provider contract/operational tests.
7. Applicable AI adversarial evaluation evidence.
8. Regulatory/partner gates where regulated.
9. Documentation states every remaining limitation explicitly.
10. Security baseline and release evidence are satisfied.

## Operational observability invariant
Every production-facing layer emits privacy-minimized evidence with correlation IDs, bounded payloads and explicit degraded/offline states. Telemetry is never a financial ledger.

## Abuse-control policy invariant
Production rate limits are server-selected, multi-scope and privacy-preserving. Low-bandwidth channels receive explicit policies and cannot bypass financial authorization or replay controls.

## API runtime resilience invariant
Normalize errors, enforce bounded retry/circuit policies, separate readiness from liveness and never retry non-idempotent financial mutations without a replay-safe boundary.

## Channel ingress invariant
REST, mobile, agent, USSD, SMS, voice and partner traffic enter a canonical policy-governed envelope with correlation, idempotency, tenant and privacy-safe scope evidence.

## API contract invariant
Every public API route is explicitly versioned and centrally governed; handler existence does not create a public contract.

## Financial intent invariant
Financial API routes are deny-by-default except explicit intent routes. Intents require tenant scope, bounded idempotency evidence and canonical payload hashes. Ledger mutation remains behind dedicated Financial Core command handlers.

17. AI action-envelope invariant
Every consequential AI action is represented as a versioned structured envelope containing tenant, actor, agent, purpose, tool/version, risk, canonical payload hash, correlation ID and bounded expiry. A model-generated string is never itself an executable command.

18. Capability issuance invariant
Capabilities are issued by deterministic server-side policy, never by a model or agent. L5/root capabilities are non-issuable. Capability TTL is bounded by risk and cannot be widened by downstream components.

19. Kill-switch invariant
AI execution has a fail-closed scoped/global kill switch. Disabling AI must stop agent/tool execution without mutating, rolling back or corrupting Financial Core truth. Re-enable is an explicit control-plane operation.

20. Cross-agent authorization invariant
An agent's output is evidence only. Agent-to-agent messages cannot transfer privileges, approvals or capabilities. Any consequential action is re-authorized at the final policy gate.

21. Modern-model neutrality
T.Pay may use OpenAI, Anthropic, compatible or local models where contracts and data policies permit. Model capability, benchmark score or vendor identity never creates authorization. External vendor documentation is design input, not executable authority.

22. Construction-continuity invariant
A session ending, token limit, provider outage or unavailable coding agent is not an execution event. Only committed repository state, CI evidence and explicit handoff records represent construction progress.

23. Completion-state invariant
The roadmap must maintain per-layer states: PLANNED → IMPLEMENTED → VERIFIED → INTEGRATED → PRODUCTION-READY → LIVE. A layer cannot skip states based on prose or model confidence.

