# T.Pay OS — PRD-001
Status: product baseline for implementation; domain Bibles remain authoritative. Version 1.0.0, 2026-10-10.

## Vision
T.Pay OS is a modular, multi-tenant digital operating system for individuals and organizations in Togo and other African markets. It connects identity, organizations, social communication, opportunities, community tontine, wallet/payment access, education, microfinance, marketplace and specialist AI. Shared platform services must not erase domain boundaries.

## Personas
- Individual/member: manage profile and sessions, join organizations, use feed, opportunities and tontine.
- Founder/administrator: create an organization, configure branding, roles, permissions and modules.
- Staff: access only explicitly granted capabilities in the active organization.
- Teacher/student/parent/school administrator: use school workflows with child-data safeguards.
- Microfinance agent/supervisor: manage authorized KYC and collection intents, reconcile provider events.
- Finance/treasury operator: review settlement, liquidity, reconciliation and exceptions.
- Platform security administrator: use separately audited privileged controls.
- AI specialist: retrieve approved context and request capability-bound tools, never directly mutate ledger state.

## Navigation contract
Primary navigation: Accueil; Gestion des organisations; Réseau social; Opportunité; Tontine communautaire. Wallet/Finances appears only when enabled and authorized. Global utilities: search, notifications, help, language, security/session center. Switching organization invalidates old scoped caches and reloads server-authorized permissions.

## MVP scope
Include a responsive shell, identity/session integration, organization directory/create flow, membership and permissions, feed/opportunity/tontine discovery, finance read views only where APIs exist, pagination, notifications, error/loading/empty/offline states, accessibility and audit correlation. Demo mode must be visibly labelled and isolated from real accounts, providers and balances.

Excluded until certified: real-money movement from demo, unattended credit or payout decisions, live provider credentials, production KYC approval, exchange execution and claims of physical-device or field-network certification without evidence.

## Functional requirements
- FR-001 Identity/session validation, expiry and revocation are server-authoritative.
- FR-002 Tenant and organization scope is resolved and authorized server-side.
- FR-003 Roles/permissions are explicit, time-bound where needed, deny-by-default.
- FR-004 Organization lifecycle transitions record actor, reason and timestamp.
- FR-005 Feed and social reads enforce visibility and use bounded cursor pagination.
- FR-006 Opportunity claims/evidence are verifiable, scoped and time-bounded.
- FR-007 Tontine cycle and contribution threshold are configurable, not globally hard-coded.
- FR-008 Wallet balances derive from the ledger; commands are idempotent.
- FR-009 AI tools have schemas, scope, permission, budget, expiry and audit receipts.
- FR-010 Every async screen has loading, empty, error, denied, stale/offline and pending states.
- FR-011 Accessibility includes keyboard, visible focus, semantic labels, contrast and reduced motion.
- FR-012 Privileged, financial and sensitive-data access is audited with redaction.
- FR-013 Retention, export, correction and deletion policies are defined by data class.
- FR-014 French baseline and locale-aware dates/numbers/currency; no floating-point money.
- FR-015 UI reports success only after durable server confirmation.

## Non-functional release targets
Proposed API SLO: 99.5% monthly after measurement is established. Target p95 ≤ 500 ms for non-provider reads under agreed load; provider latency is measured separately. Production requires TLS 1.3 at API, strict CORS, dependency/security checks, cross-tenant negative tests, restore drills, redacted telemetry and low-bandwidth/mobile testing. These are targets, not claims of current certification.

## Acceptance
A feature is accepted only with automated acceptance and negative security tests, migration/recovery plan when stateful, telemetry, support notes, exact-head green CI and review of external dependencies. Financial production additionally requires partner, regulatory, reconciliation and operational sign-off.

## Risks
Scope sprawl is controlled through vertical slices and feature flags; provider uncertainty through adapters and sandbox tests; tenant leakage through server-derived scope and negative tests; duplicate commands through idempotency and unique constraints; low bandwidth through bounded payloads; AI overreach through allowlists, approval gates, budgets and audit receipts.

## Definition of Done
Code, tests, threat review, telemetry, docs, migration/recovery plan and exact-head CI evidence. A PRD describes intended behavior; it does not prove implementation.