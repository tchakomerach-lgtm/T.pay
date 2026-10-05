# T.Pay Construction Skills

1. Exact-Head Verification — verify the exact PR head SHA and authoritative CI result.
2. Database-Invariant Engineering — encode tenant, uniqueness, state and immutability guarantees in PostgreSQL.
3. Concurrency Proof — test competing workers for reversals, approvals, sessions, callbacks, collection and recovery.
4. Financial-Core Boundary — never create a second financial truth.
5. Provider Contract Isolation — adapters isolate external payment and model providers.
6. AI Tool Governance — role/risk/approval/tenant/purpose allowlists; deny direct financial mutation.
7. AI Security Constitution — enforce DATA-versus-INSTRUCTION separation, source-to-sink gates, capability scoping and independent authorization.
8. Prompt-Injection Resilience — assume untrusted content can manipulate model behavior; minimize tools and constrain blast radius instead of relying on string filters alone.
9. Structured Action Engineering — models propose typed actions; deterministic policy validates before any tool execution.
10. Human-Approval Binding — approvals are bound to the exact canonical action/payload and expire when scope or payload changes.
11. Agent-to-Agent Trust — authenticate agent messages, prevent privilege laundering/collusion and never treat another agent's output as authorization.
12. Memory/RAG Security — provenance, trust, purpose, expiry, tenant isolation and quarantine for poisoned/conflicting knowledge.
13. AI Runtime Resilience — timeout, transient retry, circuit breaker, safe fallback, provider health and cost-aware routing.
14. Organization Access Hardening — salted hashing, throttling, lockout, tenant scope and append-only audit.
15. Offline/Africa Resilience — evidence-first sync, replay protection, device identity, cash/mobile-money reconciliation and degraded-mode UX.
16. Observability — structured audit, metrics, alerts, correlation IDs and durable operational exceptions.
17. Safe Dependency Failure — provider failures degrade predictably; ambiguous financial events quarantine.
18. Regulatory Boundary — partner-led activation for regulated Togo/UEMOA functions.
19. Durable Handoff — commit every real construction increment and document the exact next gate.
20. Cost/Token Efficiency — bounded model inputs/outputs, safe caching, routing and no unnecessary agent fan-out.
21. No False Completion — distinguish planned, implemented, verified, integrated, production-ready and live.
22. Production Readiness — backups, restore, migration safety, secrets, abuse prevention, DR and incident response.
23. Continuous African Fit — cash, mobile money, USSD/SMS/voice, low bandwidth, shared devices and multilingual operation.
24. TASS Security Scanning — inventory, safe active testing, authenticated testing, sandbox validation, evidence integrity and fail-closed release handling.
25. Supply-Chain Security — SBOM/provenance, dependency controls, secret scanning and least-privilege CI identities.
26. Egress Security — deny-by-default network access for sensitive agents and explicit host/data-class policy for external calls.
27. Kill-Switch Engineering — global and scoped AI shutdown must stop agent execution without corrupting Financial Core truth.
28. Evaluation Engineering — maintain adversarial regression corpora for prompt injection, tool misuse, data exfiltration, cross-tenant leakage, goal drift, autonomy and cost abuse.
29. Security Exception Engineering — every exception has owner, justification, expiry, compensating control and independent approval.
30. Session-Independent Continuity — the repository commit/CI state is the durable construction boundary.
