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


24. Runtime containment invariant
Model safety is not the final boundary. Sensitive AI execution requires independent harness/tool policy plus environment containment: sandbox, credential non-exposure, deny-by-default egress and destination policy. Tool results remain untrusted data.

25. Security-monitor independence invariant
Where a security monitor evaluates consequential AI actions, its decision input must be structurally separated from persuasive model prose and hostile tool results whenever the decision does not require them. The monitor evaluates the canonical structured action, identity, scope and destination.

26. External-content quarantine invariant
Suspicious tool/RAG/partner content is quarantined and cannot become policy, capability, approval or executable instructions.


## 27. Confused-deputy invariant
Requester, authorizer and executor identities are distinct facts. A downstream privileged service cannot infer authorization from the identity of an upstream agent.

## 28. Secretless-agent invariant
AI agents receive scoped references/capabilities, never reusable provider credentials, signing keys, database passwords or root tokens. Secret material is resolved only at protected execution boundaries.

## 29. Outbound-request invariant
Sensitive services use deny-by-default egress. Destinations are normalized and policy-checked server-side; private/internal targets, metadata services, unsafe redirects and unapproved hosts are blocked.

## 30. Output-boundary invariant
Model/tool output is untrusted until validated for its destination. Rendering, persistence, SQL, templates and downstream API calls use schema validation and context-appropriate encoding/parameterization.

## 31. Replay-and-order invariant
Every state-changing channel has idempotency/replay protection, ordering semantics and bounded clock-skew handling. Ambiguous financial events quarantine instead of guessing.

## 32. Recovery-equivalence invariant
Retries, compensation, rollback, restore and reconciliation paths receive the same authorization, policy, audit and anti-replay controls as forward execution.

## 33. Multi-party-control invariant
High-impact initiation, authorization and settlement cannot collapse into one autonomous principal. Independent controls enforce separation of duties where risk requires it.

## 34. Security-monitor availability invariant
Security-monitor degradation cannot silently authorize protected actions. High-impact execution fails closed or enters an explicit safe-degraded state.

## 35. Approval-UI integrity invariant
Human approval displays the canonical action/payload actually bound to approval. Stale approvals, substituted recipients/amounts and UI-only changes invalidate approval.

## 36. Migration-fortress invariant
Migration uses mapping, lineage, quarantine, dual-run/shadow mode, reconciliation, freeze/cutover and rollback. Legacy credentials are isolated and never blindly migrated.

## 37. Evidence-integrity invariant
Critical security/financial evidence is integrity-protected, time-correlated and mutation/deletion detectable. Telemetry is evidence, not financial truth.

## 38. Privacy-telemetry invariant
Observability minimizes personal/financial content, uses pseudonymous identifiers where possible and never emits secrets or raw sensitive records by default.

## 39. Abuse-economics invariant
Controls model fee abuse, bot farms, referral fraud, account takeover, cash theft, agent collusion and Denial-of-Wallet across velocity, value and behavior.

## 40. Human-factors invariant
Security-critical UX resists phishing and accidental approval, remains usable on low-end devices and makes consequential actions understandable before approval.

## 41. Reproducible-build invariant
Generated code is treated like human code: tested, reviewed, provenance-traceable and security-gated.

## 42. Security-regression invariant
Every confirmed bypass becomes a deterministic regression test before closure unless an explicitly approved compensating control exists.

## 43. Resource-containment invariant
Agents/tools/model calls have bounded time, memory, context, tool-call count, queue depth and cost. Runaway behavior trips a circuit breaker or kill switch.

## 44. Security-change-impact invariant
Security/policy changes require impact analysis over affected tenants, channels, financial paths, agents and inherited controls before release.

## 45. Control-effectiveness invariant
A documented control with no evidence of prevention, detection, containment or recovery effectiveness is not production-ready.

## 46. Channel-equivalence invariant
REST, web/mobile, offline, agent, USSD, SMS, voice and partner channels must implement equivalent authorization semantics. A weaker channel cannot become an authorization bypass.

## 47. Security inheritance invariant
Any new agent, model, connector, provider, tool, channel, workflow or organization module automatically inherits the Security Bible and may only add restrictions.

## 48. Security construction contract
docs/construction/T_PAY_SECURITY_CONSTRUCTION_CONTRACT.md is mandatory for every construction sequence. docs/construction/T_PAY_CONSTRUCTION_ROADMAP.md is the durable sequencing source.

## 49. Public-vendor boundary
T.Pay may adapt publicly documented defensive principles from OpenAI and other vendors, but never claims to reproduce private system prompts, hidden policies, proprietary detectors, model weights or confidential operational controls.

## 50. Regulated activation invariant
Technical implementation never authorizes production use of regulated payment/e-money/credit functionality. Activation requires applicable partner, license, operational, security and monitoring evidence.

## 51. No-false-green invariant
A green CI result proves only the checks executed by that workflow. It does not prove controls outside the workflow, production readiness, regulatory authorization or LIVE status.
