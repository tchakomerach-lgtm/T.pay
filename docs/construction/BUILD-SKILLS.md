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
19. API Gateway Replay Discipline — reserve atomically, reject same-key/different-payload conflicts, persist successful/failed responses, and make anonymous idempotency keys unique as well as tenant-scoped keys.
20. API Route Deny-by-Default — no route exists merely because a handler exists; route, method, auth class and data-domain policy must be explicitly allowlisted, with Financial Core routes denied until a dedicated financial policy gate exists.
21. Session-Independent Continuity — a conversation/session boundary is not a construction boundary; the durable state is the repository. Each sequence must leave a committed, testable state and an explicit earliest unmet gate for the next sequence.
22. HTTPS Adapter Enforcement — reject non-HTTPS origins, never disable TLS verification in production, forbid HTTP redirects/fallbacks, and test transport security at adapter registration and request boundaries.
23. Anthropic Provider Hardening — Anthropic uses the same provider interface, secret resolver, route/data-class policy, timeout/retry/circuit-breaker, audit and cost controls as every other model provider; provider choice never grants additional financial or tenant privileges.
24. 2026-2030 Cybersecurity Engineering — apply phishing-resistant auth where supported, crypto-agility, TLS 1.3, secret-manager runtime injection, SBOM/provenance, supply-chain controls, least-privilege workload identity, egress deny-by-default, privacy-minimized telemetry and audited vulnerability exceptions.
25. Abuse Engineering — rate limits must be atomic under concurrency, multi-dimensional, privacy-preserving and channel-aware; IP/device/actor/org/phone/channel controls share one governance model.
26. African Channel Security — USSD/SMS/voice/mobile channels cannot bypass API authorization, replay protection, rate limits, audit or financial approval gates; shared phones and SIM-swap scenarios require explicit risk controls.

27. Governed Abuse Policy — rate limits are selected server-side from normalized route/method/channel/auth policy; callers cannot supply production thresholds. Combine privacy-preserving scopes, progressive penalties and low-bandwidth channel controls without creating a second source of financial truth.

28. API Runtime Resilience — normalize errors, enforce bounded timeout/retry/circuit policies, separate readiness from liveness and never retry non-idempotent financial mutations without an explicit replay-safe boundary.
29. Health/Readiness Evidence — dependency checks are bounded, explicit and observable; degraded health cannot be represented as ready, and health failure never mutates financial truth.
30. Shared-Device Runtime Security — do not require a stable device identifier when the channel cannot reliably provide one; enforce stronger available scopes and keep financial authorization independent of device evidence.

31. Canonical Channel Ingress — normalize REST/mobile/agent/USSD/SMS/voice/partner traffic into one governed envelope with correlation, idempotency, tenant and privacy-safe scope evidence.
32. HTTPS Upstream Adapter — allowlist hosts, reject HTTP/redirects/private IP literals, bound request/response sizes and timeouts, and never put credentials in URLs.
33. Offline Evidence Sequencing — use bounded sequence numbers, payload hashes and replay/conflict quarantine without creating a parallel financial ledger.

34. API Contract Versioning — explicit /vN routes, active/deprecated/sunset policy, gateway compatibility checks and deterministic migration boundaries.
35. Bounded API Errors — stable machine-readable codes and correlation IDs without provider, database, secret or stack-trace leakage.
