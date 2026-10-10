# T.Pay OS — TRD-001
Status: technical baseline. Reconcile with existing Bibles, ADRs, code and migrations before each implementation.

## System layers
1. Responsive web/Android/future clients; no secrets or authoritative business rules in clients.
2. HTTPS edge/API: TLS, CORS allowlist, size/time limits, correlation IDs, rate limits and schema validation.
3. Identity/policy: server-side session/device validation, tenant/org resolution, permissions, risk and step-up.
4. Domain services: organizations, social, opportunity, tontine, education, marketplace, microfinance and AI.
5. Financial Core: separate ledger, payment, credit, commission, treasury and subsidy services.
6. PostgreSQL persistence: transactions, constraints, migrations, RLS, inbox/outbox and audit.
7. Versioned provider adapters: exact-body signature validation, freshness checks, replay barriers and reconciliation.
8. AI Core: provider routing, specialist agents, capability-bound tools, budgets, evaluation and redacted traces.
9. Operations: logs/metrics/traces, secrets/KMS, backups, restore drills and incident procedures.

## Repository conventions
Preserve strict TypeScript monorepo structure. Search current code and Bible registry before adding abstractions. Domain logic stays in domain packages; API composition stays in API layer. Reuse existing design tokens and semantic components. Stateful changes include migration, constraints, tests and recovery notes. Prefer small reviewable vertical slices.

## Security
Production endpoints use HTTPS and API TLS 1.3 with no HTTP fallback. Database TLS verifies certificates; insecure mode is limited to explicit local test seed mode. Authenticate and authorize every request server-side. Never trust client-supplied tenant, role, price, balance, provider status or AI permission. Use exact CORS allowlists, parameterized SQL, rate limits, bounded inputs and secret stores. Sensitive vault data uses authenticated encryption and versioned KMS references. Audit privileged access, financial transitions and AI tool execution with redaction. Apply step-up and dual control where policy requires. Never weaken a security gate to make CI green.

## Consistency and persistence
PostgreSQL is authoritative for durable multi-user state. Use UTC timestamptz and integer minor units plus ISO currency code. Ledger postings are append-only, balanced and idempotent; corrections use reversals. Separate command intent, provider processing, confirmation, ledger posting and reconciliation. Unique constraints protect idempotency/provider event IDs. Use transactional outbox and inbox deduplication. RLS is defense-in-depth and does not replace service authorization. Cursor pagination is opaque, validated, scope-bound and bounded.

## API contracts
Version external contracts. Validate JSON schemas and mutation idempotency keys. Standard error envelope: code, safe message, correlationId and optional safe details; never expose SQL, stack traces or secrets. Distinguish validation, authn, authz, conflict, rate-limit, provider-pending and internal errors. Liveness checks process health; readiness checks required dependencies. SSE replay validates scope and Last-Event-ID, with explicit cursor expiry. Each endpoint documents authz, limits, retries, observability and tests.

## Failure semantics
Provider timeout means outcome unknown, not necessarily failed. Reconcile before retrying non-idempotent external operations. AI outage degrades to safe non-mutating mode or handoff. Offline commands are re-authorized at sync time. Use deadlines, cancellation, bounded concurrency and backpressure. Optional provider outages must not masquerade as core liveness failure.

## Test strategy
Unit/domain invariants; property/fuzz tests for parsing and replay; real PostgreSQL transaction/RLS/concurrency tests; provider contract tests; cross-tenant, expired-session, replay, CORS and privilege-escalation negatives; browser/accessibility/offline E2E; physical-device and network-interruption field certification.

## Deployment
Build immutable artifacts from reviewed commits. Separate environments and secrets. Use expand/migrate/contract for breaking schemas. Verify backups before destructive work. Require smoke tests, rollback/forward-fix plan and monitored rollout. Compiling an adapter does not authorize live payments.

## Conflict policy
This TRD does not replace module Bibles, ADRs, regulator requirements or operator contracts. Stop and resolve conflicts through an ADR.