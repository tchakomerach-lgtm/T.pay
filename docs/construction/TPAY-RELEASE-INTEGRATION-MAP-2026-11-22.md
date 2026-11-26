# T.Pay — Release Integration Map (2026-11-22)

## Purpose and authority

This document is an auditable integration register, not a declaration that T.Pay is production-ready. The repository `tchakomerach-lgtm/T.pay` is the single source of truth. Product Bibles, `AGENTS.md`, `docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md`, and `docs/skills/TPAY-CONSTRUCTION-001.md` remain authoritative. This register must never override them.

Snapshot verified on 2026-11-22:
- `main`: `23c221f1a81a965cca59cf5fb28061056012a274` (commit dated 2026-11-12).
- Community Tontine / CT-042 integration candidate: `integration/community-tontine-ct042` at `fcf5e9540153d71b63c8e642b22a8706782d60f5`.
- The CT-042 candidate has successful CI, Android and Flutter workflows on that exact SHA. This is branch evidence only; it does not certify `main`, a public deployment, or live provider connectivity.
- PR #200 remains Draft. It must not be merged until the full required evidence and non-code approvals are present.

## Integration principles

1. Do not merge large feature branches solely because their individual CI runs are green. Rebase or integrate in dependency order and rerun the full required matrix on the resulting exact merge head.
2. No financial mutation outside Financial Core. No module, UI, agent, provider adapter or partner microfinance may write directly to Ledger.
3. No Super Admin implicit access to private organization data, member records, KYC, balances, module keys or vault compartments.
4. Organization and tenant context are mandatory. RLS must be tested using non-owner, non-superuser and non-BYPASSRLS roles.
5. Financial amounts use integer minor units/BigInt or exact PostgreSQL numeric; never floating-point arithmetic.
6. Every side-effecting command needs server authorization, idempotency, append-only audit, atomic persistence/outbox and explicit recovery semantics.
7. External provider callbacks are untrusted. Signature, freshness, replay, payload binding and reconciliation are required before Financial Core state transitions.
8. A successful compile, mock, preview or unit test is not proof of production readiness. Require live PostgreSQL, Web, Android and Flutter evidence on the same final SHA, plus terrain checks where required.
9. TMoney/Flooz remain disabled until signed operator/aggregator contracts, credentials in a secret store, callback specifications and real test evidence exist.
10. Insurance/protection features remain non-commercial and fail-closed until the licensed insurer, approved contract, legal/actuarial pricing and distribution authority are verified.

## Integration workstreams

### A. Platform foundation and design contract
- Preserve the existing strict TypeScript monorepo and API runtime.
- Treat DB-074 as the single object/action design contract; Web React and Flutter renderers must remain contract-compatible.
- Integrate DB-075 through DB-078 renderer/motion work only after contract parity and accessibility/reduced-motion checks.
- Keep the School Web, Experience OS, Investor prototype and Flutter applications as clients of shared contracts, not independent sources of financial truth.
- Verify responsive layouts, tenant branding, organization logos, loading/empty/error/offline/conflict/permission states and document rendering.

### B. Identity, organization and security fortress
- Integrate the global multi-organization identity and tenant-bound session chain.
- Preserve time-bounded grants, session revocation, WebAuthn/PAM and vault compartment isolation.
- Merge the P057/P058/P059/P060/P061/P062/P063/P064 chain in dependency order, not as disconnected PRs.
- Keep break-glass separate from routine administration; every exceptional access must be scoped, time-limited, approved and audited.
- Acceptance: adversarial cross-tenant reads/writes fail under restricted PostgreSQL roles; Super Admin cannot read organization-private data by default.

### C. Financial Core, Payment Intent and provider integrity
- Financial Core is the only authority for payment intent state, reservations, Ledger postings, settlement, reversals and reconciliation.
- Payment Intent persistence and FORCE RLS are present on the CT-042 candidate branch, but the CT-042 HTTP payment path is not connected.
- Before wiring the route, define and verify server-side account resolution for each funding mode:
  - Individual coverage: the member's own authorized funding account.
  - Community coverage: the community's explicitly authorized distribution/caisse funding source, with the approved allocation and gross-to-net disclosure.
  - Insurer payee: an active, organization-scoped account mapped to a verified insurer contract and partner identity.
- Do not invent account codes, wallet-to-account mappings, payee accounts, insurer partner IDs or authorization thresholds. If a verified mapping is absent, keep the payment in DRAFT/DUE and do not create a payable instruction.
- The Payment Intent and premium transition must share one transaction/unit of work, or use a durable saga with idempotent compensation. A sequence of independent commits is not acceptable.
- Require maker/checker separation, stable business idempotency, amount/currency/payload binding, immutable fee snapshots, audit/outbox, and replay/concurrency tests.
- Do not enable provider callbacks or mark a premium settled until a verified Financial Core settlement reference exists.

### D. Community Tontine and CT-042
- Complete group lifecycle, membership/consent, daily/weekly/monthly cycles, configurable contribution minima, beneficiary rotation, governance, commissions, promotion, field-agent access, offline continuity, e-carnet, reconciliation, dispute/incident/refund and payout controls.
- CT-042 protection must preserve the distinction between individual subscription and community subscription.
- Individual subscription is funded only by that member after explicit consent.
- Community subscription may be proposed by the administrator; a vote is optional where the governing rules allow it. A proposal alone never authorizes a deduction.
- Community premium deductions must be prospective, disclosed gross-to-net, backed by a valid mandate/rule and routed through Financial Core.
- T.Pay and the microfinance partner are execution/control intermediaries, not insurer, guarantor or claims obligor. Only the verified insurer decides coverage and claims.
- Remaining gates include authenticated payment route, account mapping, atomic UoW, signed provider callback and settlement, insurer claim/review/payout integration, restricted-role PostgreSQL concurrency/replay tests and real-device terrain evidence.

### E. Education / School OS
- Integrate authenticated class, enrollment, transfer, withdrawal, capacity, attendance, gradebook, weighted results, ranking, immutable bulletin snapshots, parent/student access and realtime sync.
- Every mutation must be transactional, organization-scoped, audited and published through the outbox.
- Bulletin exports must preserve immutable snapshots, organization branding and the applicable official education requirements.
- Require Web/Flutter contract parity and real PostgreSQL capacity/concurrency tests.

### F. Microfinance and partner operations
- Keep the chain Client → Agent → Supervisor → Agency → SFD → T.Pay with explicit scoped roles and temporal grants.
- Integrate client registry/KYC, field collection, supervised handover, repayment/recovery, settlement instructions, maker/checker, reconciliation and incident handling.
- A partner SFD does not become a second Ledger and does not gain governance rights over a community tontine by default.
- Verify every partner-side instruction against Financial Core state before displaying it as settled.

### G. Social, HR and Opportunity
- Integrate social graph, organization-internal RH and global social identity without duplicating member identities or permissions.
- Opportunity must support job/project listings, applications, verified organization/worker profiles, matching, contracts/workflow and dispute boundaries.
- Marketplace, HR and Social may create commercial/payment intents but cannot post Ledger entries or bypass organization permissions.
- Require moderation, anti-abuse controls, consent, audit, data minimization and tenant isolation.

### H. AI Core and Voice Fabric
- AI Core owns provider routing and specialist orchestration. Domain modules must not call model vendors directly.
- Tool execution is deny-by-default, scoped to user/org/session, short-lived and approval-gated for consequential actions.
- Voice is an untrusted input channel, never an identity or authorization factor.
- Appointment conflicts must be enforced by PostgreSQL constraints; financial and sensitive actions require step-up authentication and human approval.
- Require prompt/tool injection tests, data-boundary tests, evaluation suites, cost controls, observability and retention controls.

### I. Deployment, operations and terrain
- One authoritative backend, HTTPS/TLS 1.3, PostgreSQL TLS, migrations with checksums/locks, secret store, backups/restore drills, health/readiness, rate limits, observability and incident response.
- Replit and Lovable must consume the same GitHub contracts/backend; do not create parallel financial databases or device-local financial state.
- A preview is not a production deployment. Publish only after backend, migrations, auth, RLS, secrets, Web/Android/Flutter and security gates pass.
- Terrain chain: real Android device, approved dev/public CA, HTTPS frontend/API, PostgreSQL, real session, organization permissions, SSE reconnect, network interruption/recovery and idempotent replay.

## Candidate PR inventory (snapshot)

- #200 — Community Tontine + CT-042 integration; Draft; latest verified candidate SHA above.
- #197 — CI action pinning and PostgreSQL migration contract repair; open.
- #196 — Social/RH/Opportunity shared graph; Draft.
- #194 — Community Tontine governance and GAIN commissions; open; integrated into the #200 candidate branch.
- #179 and #178 — identity/security fortress work; open.
- #181, #180, #189, #188, #186, #185 — security vault/PAM/WebAuthn chain; dependency order must be respected.
- #176, #175, #173 and related branches — GAIN payout guardrails, reconciliation, durable case workflows; verify ancestry and tests before integration.
- #158–#170 — Education transactional APIs, enrollment, gradebook and bulletin snapshots; several PRs are stacked and some remain Draft.
- #138 and #146–#147 — DB-078 motion and global T.Pay OS portal; Draft and subject to renderer contract parity.

This inventory is a snapshot, not a claim that every PR is mergeable or production-complete. Refresh head SHAs, ancestry, CI and reviews before each integration.

## Release gates — no bypass

A release candidate may advance only when all applicable items are true on the exact candidate SHA:
- [ ] Bible consultation and implementation map completed.
- [ ] Typecheck and complete unit/invariant suite pass; skipped tests are reported separately.
- [ ] Full migration chain succeeds on supported PostgreSQL.
- [ ] Live PostgreSQL integration, restricted-role RLS, concurrency, idempotency, replay and rollback/compatibility tests pass.
- [ ] Security fortress and secret/dependency audits pass.
- [ ] API contract/auth/session/permission tests pass.
- [ ] Web production build and design-contract parity pass.
- [ ] Android build/tests pass.
- [ ] Flutter analyze/tests/build pass.
- [ ] Real-device terrain test passes where the feature touches field/mobile flows.
- [ ] External partner/insurer/operator contracts and legal approvals are verified where applicable.
- [ ] Replit/Lovable deployment is connected to the authoritative repo and tested without parallel data authority.
- [ ] Construction record, observability, rollback and incident procedure are updated.

## Next implementation sequence

1. Stabilize the current CT-042 candidate: verify CI, Android and Flutter on one immutable SHA; retain Draft until the remaining financial route/account-mapping gates are resolved.
2. Specify and implement a server-owned account/partner mapping contract; do not hardcode account identifiers or accept client-supplied account IDs.
3. Implement a transaction-scoped Financial Core + CT-042 payment-intent/premium UoW with idempotent retries and audit/outbox.
4. Add authenticated API routes and negative authorization/RLS/concurrency/replay tests.
5. Complete the provider callback and settlement chain only after signed provider contracts are available.
6. Integrate the identity/security chain and education/microfinance dependencies in topological order.
7. Integrate Social/RH/Opportunity and AI/Voice through shared identity, permissions and API contracts.
8. Rebase each integration batch, rerun the full required matrix on its final SHA, then request review. Do not merge automatically.

## Status vocabulary

- **Implemented**: code exists and is connected to the intended runtime.
- **Tested**: relevant tests passed on the cited SHA; name the test layer.
- **Verified**: evidence from real persistence/runtime/device/provider is available.
- **Production-ready**: all applicable release gates and external approvals passed.
- **Blocked**: a named dependency, contract, account mapping, permission or infrastructure item is missing.

Never use these statuses interchangeably.
