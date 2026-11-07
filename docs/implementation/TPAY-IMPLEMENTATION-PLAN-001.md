# T.Pay OS — IMPLEMENTATION-PLAN-001

## Execution policy
Implement one vertical slice at a time. Consult Bible registry and existing code before changes; avoid duplicate abstractions; run targeted tests, security gate and full CI; inspect exact-head results; record residual blockers. The plan is not a completion claim.

## Tracks and exit evidence
- T0 Baseline: repo/Bible/ADR/CI inventory; report tied to commit SHA.
- T1 Identity/tenant: sessions, device lifecycle, organization context, RBAC and revocation; cross-tenant and expired/revoked-session tests.
- T2 Organization workspace: lifecycle, branding, invitations, roles and scoped navigation; end-to-end creation/switch/revoke.
- T3 Design/runtime shell: tokens, routing, responsive layouts and states; browser accessibility and overflow tests.
- T4 Feed/social: visibility, cursor pagination, notifications and realtime; tampered cursor and replay tests.
- T5 Opportunity: listings, claims, evidence and applications; expiry/risk tests and no financial side effects.
- T6 Community tontine: configurable rules, membership, contribution intents, governance and reconciliation; replay/duplicate tests.
- T7 Financial Core: ledger, payment intents, holds, settlement, treasury; real PostgreSQL atomicity/concurrency and balanced ledger.
- T8 Microfinance/education/subsidy: KYC, collections, academic data, guarantees and recovery; tenant/child-data tests and human approvals.
- T9 AI Core: model adapters, specialist agents, retrieval and tools; prompt-injection, permission, lease, budget and redaction tests.
- T10 Vault fortress: access broker/PAM, grants, seal/unseal, rotation, break-glass and key destruction; cross-vault tests and real KMS evidence.
- T11 Integrations: operator contracts, signed callbacks and reconciliation; sandbox credentials, replay/signature tests and unknown-outcome handling.
- T12 Reliability: outbox, telemetry, backups, restore and runbooks; restore drill, alert and load evidence.
- T13 Release certification: security, accessibility, browser, Android, field network and compliance; exact-head CI, approved visual baseline and physical-device evidence.

## Immediate sequence
1. Reconcile open PRs and current main head; stale-base PRs require deliberate update, not blind merge.
2. Run current CI and inspect failed/pending job logs.
3. Compare these contracts with existing docs and update index rather than duplicate.
4. Implement one thin UI slice against actual APIs: signed-in shell, organizations, opportunity/tontine read-only.
5. Add typed API client with correlation IDs, cancellation, timeout and safe retry semantics.
6. Add route guards and organization-context cache reset.
7. Add cursor pagination, loading/empty/error/offline states and browser tests.
8. Wire only endpoints that exist and pass authorization; demo fixtures remain clearly labelled.
9. Keep financial writes hidden until PostgreSQL transaction and provider certification pass.
10. For every slice: implementation, tests, fortress gate, exact-head CI and construction record.

## PR template requirements
Goal/non-goals; Bible/ADR references; existing files reused; threat model and authz matrix; schema/API changes; acceptance criteria; unit/integration/security/E2E tests; telemetry and failure states; migration/recovery plan; CI evidence and remaining gates.

## Definition of Ready
One reviewable scope, dependencies inspected, relevant Bible/security rules identified, explicit API/data contract, acceptance and negative tests, external dependencies contract-tested or marked blocked.

## Definition of Done
Reviewed code; exact-head tests pass; tenant isolation and security negatives pass; migration/recovery verified; UX states complete; telemetry redacted; docs and construction record updated; no unsupported production-ready claim.

## Non-waivable release gates
Real PostgreSQL concurrency/migration tests; production TLS and KMS/secrets; operator sandbox contracts for live payments; reconciliation and incident runbooks; reviewed browser baseline and accessibility; physical Android trusted-CA/network interruption tests; applicable Togo/UMOA regulatory review.