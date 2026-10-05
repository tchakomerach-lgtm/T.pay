# T.Pay Construction Skills

1. Exact-Head Verification — verify the exact PR head SHA and authoritative GitHub Actions result.
2. Database-Invariant Engineering — encode tenant, uniqueness, state and immutability guarantees in PostgreSQL.
3. Concurrency Proof — test competing workers for reversals, approvals, sessions, callbacks, collection and recovery.
4. Financial-Core Boundary — never create a second financial truth.
5. Provider Contract Isolation — adapters isolate external payment and model providers.
6. AI Tool Governance — role/risk/approval/tenant allowlists; deny direct financial mutation.
7. AI Security — prompt-injection detection, bounded payloads, secret boundaries, audit/security events.
8. AI Runtime Resilience — timeout, transient retry, circuit breaker, safe fallback, provider health and cost-aware routing.
9. Organization Access Hardening — salted hashing, throttling, lockout, tenant scope and append-only audit.
10. Offline/Africa Resilience — evidence-first sync, replay protection, device identity, cash/mobile-money reconciliation and degraded-mode UX.
11. Observability — structured audit, metrics, alerts, correlation IDs and durable operational exceptions.
12. Safe Dependency Failure — provider failures degrade predictably; ambiguous financial events quarantine.
13. Regulatory Boundary — partner-led activation for regulated Togo/UEMOA functions.
14. Durable Handoff — commit every real construction increment and document the exact next gate.
15. Cost/Token Efficiency — bounded model inputs/outputs, safe caching, routing and no unnecessary agent fan-out.
16. No False Completion — distinguish implemented, tested, integrated, certified and production-live states.
17. Production Readiness — backups, restore, migration safety, secrets, abuse prevention, DR and incident response.
18. Continuous African Fit — cash, mobile money, USSD/SMS/voice, low bandwidth, shared devices and multilingual operation.


## Operational Observability Skill
- Measure before claiming reliability: latency, queue depth, provider availability, callback lag, offline backlog and reconciliation age.
- Every alert is correlated, idempotent and durable; notification failure is itself observable.
- Validate SLOs with production evidence, not configuration alone.

19. API Gateway Replay Discipline — reserve atomically, reject same-key/different-payload conflicts, persist successful/failed responses, and make anonymous idempotency keys unique as well as tenant-scoped keys.
20. API Route Deny-by-Default — no route exists merely because a handler exists; route, method, auth class and data-domain policy must be explicitly allowlisted, with Financial Core routes denied until a dedicated financial policy gate exists.
21. Session-Independent Continuity — a conversation/session boundary is not a construction boundary; the durable state is the repository. Each sequence must leave a committed, testable state and an explicit earliest unmet gate for the next sequence.
