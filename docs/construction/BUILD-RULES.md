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
OpenAI, Anthropic, local models, TMoney, Flooz, PI-SPI and MFI partners are replaceable adapters. Anthropic is a first-class authorized provider adapter, never a bypass path. Provider callbacks require raw-body verification, freshness, identity/amount/currency/reference validation, replay protection and quarantine for ambiguity. Credentials and regulatory certifications must be real; code cannot manufacture them.

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
T.Pay may use authorized OpenAI, Anthropic or local model adapters when credentials/connectors are available. Architectural replaceability is the solution to vendor limits, not circumvention. Provider-specific capabilities must remain behind the same policy, audit, secret and data-class boundaries.

## 15. HTTPS-only external adapters
All network-facing T.Pay adapters MUST use HTTPS/TLS. Plain HTTP endpoints, redirects to HTTP, mixed-content API calls and insecure fallback transports are prohibited. Adapter configuration must reject non-HTTPS origins at startup and in tests. TLS verification may not be disabled in production. Certificate/proxy behavior must be explicit and observable without weakening verification. Channel adapters (REST, mobile, USSD/SMS gateways, voice, partner APIs) must terminate at a governed gateway and cannot bypass authentication, authorization, idempotency, rate limits or audit.

## 16. 2026-2030 cybersecurity baseline
- Prefer TLS 1.3, modern cipher suites and platform-managed certificate rotation; do not invent custom cryptography.
- Use crypto-agility: algorithm identifiers and key versions must be explicit so approved post-quantum/hybrid algorithms can be introduced without redesigning financial records.
- Prefer phishing-resistant authentication such as WebAuthn/passkeys for capable user/admin devices, with controlled recovery paths for low-end/shared-device environments.
- Secrets must come from an authorized secret manager at runtime; never from source code, migrations, client bundles or database business records. Rotation and revocation are first-class events.
- Every release must be capable of producing an SBOM and provenance evidence; dependencies require automated vulnerability/license checks, lockfile discipline and controlled update windows.
- Protect the software supply chain with signed/provenance-aware builds where the deployment environment supports them; separate build identity from runtime identity.
- Use least privilege, short-lived credentials, workload identity where available, and deny-by-default network egress for sensitive services.
- Treat prompt injection, tool poisoning, model-context exfiltration, dependency confusion, credential stuffing, SIM-swap risk, replay and API abuse as first-class threat models.
- Security telemetry must be privacy-minimized, tamper-evident and correlated; never log secrets, raw authentication factors, payment credentials or unnecessary personal identifiers.
- Security controls must fail closed for authorization and fail safely for availability; a security-control outage must not fabricate or mutate financial truth.
- Automated security scanners are evidence-generators, not proof that zero vulnerabilities exist. Critical findings block release unless an explicit, audited exception exists.

## 17. Definition of Done
1. Exact-head CI green.
2. Typecheck/unit/integration/audit gates green.
3. PostgreSQL race/idempotency/replay proofs where relevant.
4. Production repository/handler boundary.
5. Audit/outbox/observability.
6. Provider contract/operational tests.
7. Regulatory/partner gates where regulated.
8. Documentation states every remaining limitation explicitly.
9. Security baseline and release evidence are satisfied for the layer.

## Operational observability invariant
- Every production-facing layer must emit durable operational evidence with correlation IDs, bounded payloads and explicit degraded/offline states.
- SLO targets are policy, never proof of achieved production performance.
- Alert delivery failure must never alter Financial Core truth; alerts become queued/retriable operational evidence.
- Africa/Togo deployments must support low-bandwidth escalation paths (SMS/internal queue) without storing provider credentials in application data.
