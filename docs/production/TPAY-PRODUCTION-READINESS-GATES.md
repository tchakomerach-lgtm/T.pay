# T.Pay Production Readiness Gates — Bible/Prompt 001 Alignment

Status: proposed release gate; this document does not certify any component as production-ready.

## Purpose

Translate the T.Pay OS vision, Prompt 001, `AGENTS.md`, `docs/skills/TPAY-CONSTRUCTION-001.md`, the Bible consultation registry, the implementation map, the AI Core skill, the security skill, and the threat model into a verifiable release sequence. Architecture documentation, a merged PR, a successful deployment upload, or a UI demo is not proof that a business capability is production-ready.

## Product invariants

1. **T.Pay remains the authority.** Identity, policy, authorization, domain rules, financial state, and final decisions are enforced by T.Pay services, never by an LLM or client UI.
2. **One canonical financial record.** Every money movement is an authorized, idempotent command recorded through the canonical append-only double-entry ledger. No frontend, AI agent, webhook, notification worker, or provider callback directly changes balances.
3. **Tenant isolation everywhere.** Every organization-owned read, write, background job, export, file, cache entry, and AI tool call is scoped to a verified organization context and authorized actor.
4. **Deny by default.** Unknown identities, roles, tools, provider responses, signatures, states, and invalid inputs fail closed.
5. **Human control for high risk.** Credit decisions, financial approvals, identity recovery, privilege changes, and irreversible administration require explicit authorized human approval unless a separately reviewed policy permits a narrower automation.
6. **Auditable operations.** Privileged and financial state transitions record actor, session, organization, resource, action, outcome, correlation/idempotency identity, and time without exposing secrets or sensitive raw data.
7. **Provider independence.** AI, payment, SMS, voice, and other providers are adapters; they cannot redefine T.Pay policy or the canonical state.
8. **Honest capability status.** Each feature is marked DOCUMENTED, PROTOTYPE, IMPLEMENTED, TESTED, SECURITY-VALIDATED, or PRODUCTION-READY with evidence. A UI simulation must be labeled as such.

## Release sequence and acceptance criteria

### Gate 0 — CI and source integrity (P0)

- Diagnose the root cause of GitHub Actions `startup_failure`; record run IDs, exact SHA, error evidence, corrective action, and regression prevention.
- Ensure workflows create jobs and execute on the exact candidate commit. Never replace a missing job with a presumed pass.
- Required checks: dependency installation, TypeScript typecheck/build, unit tests, security fortress, PostgreSQL integration tests, web build, dependency/security audit, and any domain-specific checks.
- Pin actions to approved immutable versions/SHAs according to repository policy; grant minimum workflow permissions; protect secrets and deployment environments.
- Acceptance: all required checks are green on the exact PR head and the resulting merge candidate. Any infrastructure exception is documented and independently verified; checks are not disabled to obtain green status.

### Gate 1 — Identity, authorization, tenant boundary (P0)

- Test authentication/session expiry, revocation, step-up authentication, and organization binding.
- Test unauthorized access, cross-tenant reads/writes, role escalation, object-ID substitution, background-job context loss, malformed input, replay, rate limits, and failure recovery.
- Verify authorization on the server for every protected command; UI visibility is not authorization.
- Acceptance: negative tests prove requests fail closed and do not disclose data or create side effects.

### Gate 2 — Financial Core (P0)

- Verify ledger balance constraints, append-only semantics, transaction atomicity, unique idempotency keys, concurrency behavior, and deterministic monetary arithmetic using integer minor units or a vetted exact decimal representation.
- Test duplicate requests, timeout-after-commit, provider retries, partial failure, reversals/compensation, reconciliation mismatches, and recovery.
- Verify signed webhook authentication, timestamp/replay controls, event deduplication, and separation of provider delivery from financial confirmation.
- Acceptance: no tested failure or replay creates a duplicate financial effect; every accepted posting is balanced and traceable. Reconciliation never silently mutates the ledger.

### Gate 3 — Super Admin and governance (P0/P1)

- Separate Root/break-glass authority, Super Admin, organization administrators, operators, auditors, and support roles.
- Enforce just-in-time, scoped, expiring privilege elevation; step-up authentication; separation of duties; dual approval for high-risk actions; and a protected audit trail.
- Require a reason, target scope, preview/dry run where applicable, explicit confirmation, and post-action verification for destructive or global changes.
- Prove an AI agent cannot grant itself privileges, alter its own policies, bypass approval, or directly mutate security/financial state.
- Acceptance: adversarial and negative tests cover escalation, approval collusion assumptions, expired grants, replay, and audit tampering.

### Gate 4 — Prompt 001 / AI Core

- Use the provider registry and shared orchestration contract; specialist agents do not call providers or privileged tools outside the governed AI Core.
- Each tool has a versioned schema, role and organization allowlist, read/write classification, risk level, confirmation rule, rate limit, timeout, idempotency semantics, and audit event.
- Enforce least-context data access, data-classification policy, prompt/tool injection defenses, output validation, budget limits, and provider failover rules.
- Maintain golden tasks, authorization tests, tool-misuse tests, adversarial prompts, hallucination checks, and regression evaluations.
- Acceptance: tool calls are authorized server-side at execution time; malformed or unauthorized actions are rejected; financial or irreversible actions require the configured human approval.

### Gate 5 — School OS, School Subsidy, Microfinance and Tontine

- School Subsidy workflow: request and school dossier; eligibility and budget verification; supplier and student coverage; authorized microfinance guarantee/approval; signed financing terms; controlled disbursement; supply delivery evidence; daily tontine-based recovery; reconciliation; arrears/disputes; closure and audit.
- Keep school records, financial records, financing contract, guarantee exposure, supplier invoices, deliveries, and recovery schedule linked by stable IDs and organization scopes.
- Define explicit states, transition permissions, deadlines, cancellation/rollback rules, fees, rounding, partial repayment, late payment, default, and dispute handling before activating real money movement.
- Test duplicate daily collection, offline resubmission, partial provider failure, missed contributions, changed student counts, and cross-organization access.
- Acceptance: end-to-end tests use a real test database and provider sandbox or deterministic contract fakes; demos remain clearly non-financial until actual integrations and approvals exist.

### Gate 6 — Other domains and shared platform

- Marketplace/opportunities, social/growth, documents, voice, mobile and offline sync must use the same identity, tenant, consent, audit, policy, and observability foundations.
- Offline commands use unique operation IDs, expiry/authorization checks at sync time, conflict policies, and duplicate protection. Offline state is never treated as proof of payment.
- Documents and AI contexts apply data minimization, access control, retention/deletion rules, and safe logging.
- Acceptance: domain-specific contracts and integration tests prove boundaries; unavailable integrations are explicitly labeled rather than simulated as completed.

### Gate 7 — Operations and production launch

- Validate TLS configuration, secret rotation, dependency/SBOM review, rate limits, abuse controls, monitoring, actionable alerts, incident playbooks, backup integrity, and restore drills.
- Define SLOs, health/readiness semantics, migration compatibility, rollback, feature flags, deployment approvals, and incident ownership.
- Verify data retention, privacy, consumer protection, financial licensing and other applicable requirements for Togo/UMOA and every launch market with qualified local compliance advice.
- Acceptance: documented release approval, tested restoration evidence, monitored canary/smoke test, and a rollback path. A Vercel READY status alone is not release evidence.

## Required construction record for every brick

- Brick ID, user/field outcome, affected bounded contexts, owner, and current status.
- Exact Bible/ADR/skill paths and source commit consulted.
- Existing implementation reused; API/data contracts and state machine.
- Threats, trust boundaries, authorization, tenant scope, idempotency, concurrency, offline behavior, provider failures, and safe failure state.
- Migration/rollback plan and operational metrics/alerts.
- Tests added, commands actually run, test environment, results, and CI run URLs for the exact SHA.
- Security and finance review outcomes; unresolved risks and explicit release restrictions.

## Current known blockers (must be rechecked before release)

- GitHub Actions runs previously observed for PR #147 SHA `aec239e39d9018a3e2229324c583facb9efca100` ended in `startup_failure` before jobs were created. Root cause was not established; do not assume this describes the latest state without rechecking.
- The PR #147 portal and PR #145 School OS are described as prototypes with simulated state, not real financial integrations.
- Vercel access to deployment diagnostics previously returned an authorization error. A deployment marked READY does not prove runtime behavior or integration correctness.
- PRs concerning security detectors, request validation, PostgreSQL connection handling, AI/finance engines, and portal changes must be reviewed and tested against their exact current heads before merge.

## Merge and launch policy

Do not merge a security- or finance-sensitive PR solely because it is mergeable. Do not merge a batch of PRs without dependency ordering and per-PR evidence. Merge in small dependency-ordered groups: CI/source integrity and migrations; identity/security; ledger and financial commands; domain services; AI/integrations; UI; then hardening. Re-run required checks on the resulting merge candidate.

This document is a proposed operational gate. It is not proof that any gate has passed, that the product is compliant, or that production funds can safely be handled.
