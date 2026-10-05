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

31. Action-Envelope Engineering — canonical typed actions with payload hashes, correlation and expiry.
32. Deterministic Capability Issuance — server-side capability issuance with risk-bounded TTL and no agent self-escalation.
33. Policy-Gate Engineering — final deny-by-default authorization immediately before consequential sinks.
34. Kill-Switch Engineering 2.0 — fail-closed AI shutdown with Financial Core integrity preservation and explicit recovery.
35. Cross-Agent Authorization — treat agent outputs as evidence and re-authorize every consequential sink.
36. Model/Vendor Agnosticism — isolate model providers and prevent vendor/model choice from creating privilege.
37. Construction-State Ledger — record layer state and evidence without conflating implementation with verification or production readiness.
38. African Channel Security — secure USSD/SMS/voice/mobile-money/cash ingress through the same canonical action and authorization boundary.
39. Security-First Offline Recovery — quarantine ambiguous offline financial events and reconcile through Financial Core rather than trusting client state.
40. Regulatory Activation Gates — keep regulated payment/e-money/credit capabilities disabled until partner, license and operational controls are evidenced.


41. Runtime Containment Engineering — sandbox, filesystem boundaries, credential non-exposure and deny-by-default egress.
42. Security-Monitor Independence — judge structured action/intent rather than persuasive model prose when possible.
43. External-Content Quarantine — provenance, trust, quarantine and post-tool inspection for hostile content.
44. Adaptive Red-Team Engineering — evaluate repeated/adaptive attacks, not only one-shot prompt injections.
45. Partner-Evidence Security — signed/idempotent/bound partner events before financial effects.

46. Trust-Boundary Mapping — mark every ingress, transformation, privilege transition and consequential sink.
47. Confused-Deputy Prevention — keep requester, authorizer and executor identities distinct.
48. Decision-Provenance Engineering — preserve privacy-minimized evidence/reasons for security decisions and approvals.
49. Data-Classification Enforcement — bind data class to storage, model routing, egress and retention.
50. Secretless-Agent Engineering — agents receive references/capabilities, never reusable credentials.
51. SSRF/Outbound Request Defense — normalize and authorize destinations server-side; block internal metadata/private targets and unsafe redirects.
52. Output-Handling Security — validate and context-encode model/tool output before rendering, persistence, SQL, templates or downstream APIs.
53. Replay/Ordering Proof — nonce/idempotency, monotonic sequence and bounded clock-skew tests.
54. Security-Monitor Fail-Closed Design — monitoring degradation cannot silently authorize high-impact actions.
55. Approval UX Integrity — display the canonical action bound to approval; stale/substituted approvals fail.
56. Multi-Party Control — separate initiation, authorization and settlement for high-impact operations.
57. Transaction-State Machine Proof — explicit allowed financial transitions and terminal semantics.
58. Recovery-Path Security — retries, compensation, rollback and restore receive forward-path security controls.
59. Migration-Fortress Engineering — quarantine, dual-run, reconciliation, freeze/cutover, rollback and legacy credential isolation.
60. Canary/Chaos Security — test isolation, kill switches and provider failure without real-money damage.
61. Evidence-Integrity Engineering — hash/sign critical evidence and detect deletion or mutation.
62. Privacy-Preserving Telemetry — minimize payloads and prohibit secrets/raw sensitive records in traces.
63. Abuse-Economics Engineering — model fraud incentives, bot farms, fee abuse, cash theft and Denial-of-Wallet.
64. Human-Factors Security — secure defaults, anti-phishing UI, clear approvals and low-literacy-safe flows.
65. Dependency/Build Reproducibility — review transitive changes and preserve build provenance.
66. Security Regression Corpus — every confirmed bypass becomes a deterministic regression test.
67. Runtime Resource Isolation — bound time, memory, context, tool calls, queues and cost.
68. Security-Change Impact Analysis — map security changes to tenants, channels, financial paths and inherited controls.
69. Control-Effectiveness Measurement — measure prevention, detection, containment and recovery outcomes.
70. African-Channel Equivalence — prove REST/mobile/USSD/SMS/voice/offline/partner paths cannot bypass the same security semantics.
