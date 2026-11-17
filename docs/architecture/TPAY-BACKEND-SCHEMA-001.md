# T.Pay OS — BACKEND-SCHEMA-001

## Rule
This is a logical data model, not replacement DDL. Search current migrations first and reuse/evolve existing identities, organizations, ledger, audit, vault and realtime structures. Every new table requires a numbered migration, constraints, RLS strategy, recovery notes and PostgreSQL integration tests.

## Common conventions
Where appropriate use UUID id, required tenant_id, organization_id only nullable for explicitly global resources, UTC created_at/updated_at, actor attribution and version for optimistic concurrency. Sensitive records need classification and retention policy. Avoid duplicated PII.

## Logical entities and integrity
- Identity: actors, devices, sessions, credentials. Unique identifiers, expiry/revocation, hashed token material; no plaintext bearer tokens.
- Authorization: roles, permissions, grants and policy decisions. Explicit scope, validity, revocation and grantor audit.
- Organizations: organizations, memberships, invitations, branding versions. Unique normalized slug per scope and explicit lifecycle.
- Social: posts, comments, reactions, conversations and messages. Visibility enforcement on every read.
- Opportunity: listings, applications, claims, evidence and commitments. Expiry and evidence hash; no financial authority.
- Tontine: groups, memberships, rules, contribution intents and payout proposals. Configurable contribution policy, governance audit and idempotency.
- Finance: ledger accounts, transactions, entries, holds, payment intents, provider events and reconciliations. Balanced immutable postings and unique provider/idempotency keys.
- Credit: applications, decisions, contracts, schedules and repayments. Versioned policy, disclosures and required human approvals.
- Commissions: rules, snapshots, accruals and settlements. Immutable calculation snapshot and audit.
- Subsidy: requests, guarantees, budgets, disbursement intents and recovery schedules. Approval, reservation and reconciliation.
- Education: schools, years, classes, students, guardians, enrollments and assessments. Organization scope and child-data minimization.
- AI: agents, tool grants, capability leases, runs, receipts and evaluations. Scope/action/expiry/budget limits and redacted traces.
- Vault: vaults, key references, encrypted objects, grants and audit. Explicit vault scope, no parent privilege inheritance and versioned KMS refs.
- Platform: outbox, inbox, idempotency, audit and feature flags. Unique event keys, redaction and retention.

## Financial invariants
Use BIGINT minor units and ISO currency codes, never floating-point money. A posted transaction has balanced entries under currency policy. Posted entries are immutable; corrections use reversal/adjustment transactions. Atomically write transaction, entries, idempotency record and outbox event. Verify provider callbacks over exact raw bytes, freshness and replay state before mutation. Provider confirmation is not ledger posting until the domain command reconciles. Treasury liquidity and daily limits are rechecked atomically at execution/reservation time.

## Idempotency/outbox contract
Scope idempotency to tenant, actor, operation and key; store request hash and durable result reference. Same key/same payload returns prior result; same key/different payload conflicts. Outbox carries schema version, aggregate identity, redacted payload, timestamps and retry state. Consumers deduplicate at-least-once delivery.

## Tenant isolation
Bind tenant context server-side for every query; organization resources additionally require membership and permission. Use transaction-local PostgreSQL context and reset pooled connections. Composite foreign keys should prevent cross-tenant references where practical. Parent vault or admin status does not silently grant child access. Test cross-tenant reads/writes, cursor replay, ID guessing and pooled-connection context leakage.

## Pagination/performance
Prefer keyset cursors using stable ordering such as created_at plus id. Cursor must be opaque, integrity-protected, versioned, bound to filters and authorization scope, and server-validated. Bound page size. Add indexes from measured query plans; avoid expensive total counts on every feed request.

## Migration checklist
Inspect current schema; define ownership/scope/classification/retention; add FK/check/unique constraints and indexes; apply RLS/FORCE RLS where appropriate; use expand/backfill/validate/contract for live tables; test clean install and upgrade; run real PostgreSQL concurrency tests; document restore/recovery; verify exact-head CI. TypeScript-only tests cannot prove database guarantees.