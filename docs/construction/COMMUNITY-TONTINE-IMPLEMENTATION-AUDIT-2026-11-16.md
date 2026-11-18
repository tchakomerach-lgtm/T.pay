# Community Tontine — implementation audit against Bible prompts 001–031

**Audit date:** 2026-11-16  
**Audited commit baseline:** d8e26ecfb0eedcd287b4b28580e39c9207243f33  
**Working branch:** `feat/community-tontine-prompt-001-031`  
**Scope:** repository evidence only. This is not a production or field certification.

## Executive decision

**No prompt is certified complete.** The repository contains substantial domain, PostgreSQL, security, settlement and UI foundations. The main production API still boots `createSchoolApiServer`, its route allowlist only accepts `/v1/education/*`, and authentication still resolves actors through `education_actors`. A GitHub code search for `/v1/tontine/groups` returned no route implementation. React and Flutter clients call those Tontine paths, so the end-to-end product path is not yet connected.

The Identity Core migration and pure context resolver exist, but `apps/api-server/src/main.ts` does not use them. Migration 130 explicitly avoids automatic legacy identity backfill; verified tenant/org/actor links and runtime resolution remain required.

## Evidence legend

- **Foundation**: domain/schema/service/test artifacts exist; does not prove production integration.
- **Partial**: some requirements have code or tests, but one or more required layers are missing.
- **Blocked**: a prerequisite prevents the feature from operating end to end.
- **Unspecified**: the source prompt text is unavailable or too incomplete to audit faithfully.
- **Not certified**: none of these labels means the feature is complete.

## Prompt-by-prompt audit

| Prompt | Scope recovered from history | Repository evidence | Assessment |
|---|---|---|---|
| 001 | Foundations, roles, cycles, contributions, offline, governance, audit, APIs, tenant isolation | ADR-004; domain/service/cycle/rules/reconciliation; migrations 100–114; tests | Partial; production API routes and end-to-end proof missing |
| 002 | Original title and requirements not recovered | No reliable acceptance criteria | Unspecified; do not invent |
| 003 | Secure multi-MFI integration, consent, payment intents, callbacks, reconciliation, kill switch | community-tontine-mf services; migrations 106–114; maker-checker and settlement tests | Partial; real provider adapters/contracts and live E2E absent |
| 004 | TPTA, QR verification, trust profile/passport, admin decision, partner selection, individual contribution plan and mandate | Admission/recruitment modules exist; no complete TPTA/Trust Passport end-to-end path evidenced | Partial; original prompt truncated after section 58 fragment EXIT_P... |
| 005 | Multi-MFI, individual contribution frequency, rotation, payout, commissions, mobile money | Group, member, schedule, payout, fee and MFI foundations | Partial; partner choice and live settlement not proven |
| 006 | Auditable rotation and distribution engines | Rotation, payout orchestrator/settlement, beneficiary slots, concurrency test | Partial; full governed rotation and payout E2E missing |
| 007 | Trust/admission, capacity, community guarantee, explainable score, appeals | Admission and recruitment foundations/tests | Partial; complete evidence/appeal/scoring UI/API not proven |
| 008 | Field collection agents, routes, QR, offline envelopes, evidence, sync | Offline module and migration 102; Flutter client foundation | Partial; actual field-device chain and agent workflow not certified |
| 009 | Beneficiary payout and inter-MFI settlement/netting | Settlement and MFI settlement repositories/migrations | Partial; real provider execution and reconciliation absent |
| 010 | Smart rotation/order/beneficiary-turn protection; detailed text unavailable | Rotation code and tests | Unspecified beyond title/intent; no full acceptance audit possible |
| 011 | Contribution truth, settlement reconciliation, snapshots, event bus, offline | Reconciliation, callback, receipt, settlement, outbox code and live PG tests | Partial; no production API path or external rails |
| 012 | Fraud/collusion command center, risk graph, playbooks, human review | Risk/intelligence modules and governance foundations | Partial; full case workflow, evidence and human review UI/API not proven |
| 013 | Geo-trust and participation boundaries | No complete geospatial consent/proof workflow evidenced in audited path | Partial/Unverified |
| 014 | Zero Trust, resilience, key management, recovery, fee/account separation | Security fortress, vault/audit, policy and recovery tests | Partial; end-to-end operational key management/DR proof missing |
| 015 | Versioned commission governance and pricing controls | Fee snapshots and fee governance foundations | Partial; policy modes, quorum, fee lock and legal policy confirmation not fully proven |
| 016 | Promotion and multi-platform distribution | No complete campaign/channel/attribution workflow evidenced in audited Tontine runtime | Partial/Unverified |
| 017 | Recruitment, referrals, ambassadors, quotas, waitlist, appeals, membership lock | Recruitment module and tests | Partial; no complete API/UI, temporal permissions and real activation proof |
| 018 | Readiness, immutable launch snapshot, consent, ARMED/ACTIVE preflight | Launch/readiness concepts referenced in register; no complete production flow evidenced | Partial/Blocked by API/Identity integration |
| 019 | Daily contribution operations and real-time status | Contribution services, schedules, receipts, Flutter/React views | Partial; no live route/runtime integration |
| 020 | Dispute, incident, recovery, evidence and mediation | Tontine case module and migrations 103; Flutter incident panel foundation | Partial; full governed case lifecycle/API proof missing |
| 021 | Trust, group/individual/partner risk, community safety | Governance and intelligence modules | Partial; complete risk decision/appeal workflow not proven |
| 022 | Historical text incomplete | No authoritative acceptance criteria | Unspecified |
| 023 | Capital allocation and beneficiary orchestration | Payout and settlement orchestration foundations | Partial; portfolio allocation/reserve/pool features not proven end to end |
| 024 | Economic network, RFQ, group buying, suppliers and delivery | Economic network module exists | Partial; procurement/supplier UI/API/fulfilment proof missing |
| 025 | Inter-community/cross-tontine coordination; details partial | No full federation/cross-community workflow evidenced | Unspecified/Partial |
| 026 | Community intelligence, economic digital twin and prediction | Tontine intelligence module exists | Partial; explainable data lineage and scenario UI/API not proven |
| 027 | Autonomous operations/agentic control plane; details partial | No full bounded agent execution plane evidenced in Tontine runtime | Partial/Unverified |
| 028 | Identity/trust/agent security fabric | Identity schema 130, resolver, passkey module, device trust foundations | Partial; runtime resolver not wired to API; KYA/intent chain not fully proven |
| 029 | Fraud/AML/anti-scam engine; detailed content not recovered | Risk/intelligence foundations only | Unspecified; title/intention only, not approved full spec |
| 030 | Original title and requirements not recovered | No reliable acceptance criteria | Unspecified |
| 031 | Original title and requirements not recovered | No reliable acceptance criteria | Unspecified |

## Verified technical evidence on baseline d8e26ec

GitHub Actions:
- CI #43932459550: success.
- Flutter #43932459593: success.
- Android #43932459529: success.

The CI job reports:
- Unit/type/build suite: 380 tests, 351 passed, 0 failed, 29 skipped because that first broad test invocation had no `TPAY_DATABASE_URL`.
- Dedicated PostgreSQL 17 integration command: 17 tests, 17 passed, 0 failed, 0 skipped. This includes live migration/financial invariants, settlement/outbox/notifications/reconciliation/idempotency, admission RLS, Identity RLS/schema and a concurrent beneficiary-slot/duplicate-receipt barrier test.
- Security fortress checks passed.
- React production build and design-contract parity passed.
- Production dependency audit reported 0 vulnerabilities.
- Flutter analysis reported no issues; Flutter tests passed; debug APK built.
- Android Gradle debug APK build succeeded.

These are CI environment results on the exact baseline SHA, not production deployment, field device, operator payment or regulatory certification.

## P0/P1 correction order

1. **P0 — Production identity runtime**: replace the Tontine dependency on `education_actors` with verified Identity Core subject/actor-link/tenant/org membership/session/temporal-grant resolution. Do not auto-backfill identity mappings. Add transaction-scoped tenant/org context and adversarial RLS tests using a non-owner runtime role.
2. **P0 — Real Tontine API router**: add authenticated `/v1/tontine/*` routes for groups, membership/admission, cycles/rotation, contributions, governance, cases, payout, reconciliation and evidence. Bind every route to permission, tenant, organization, idempotency, audit and repository transactions. Add HTTP integration tests proving the React/Flutter calls resolve; current School router only allowlists `/v1/education/*`.
3. **P0 — Financial truth**: ensure every confirmed contribution/payout uses the Financial Core Unit of Work, immutable fee snapshot, Ledger, receipt and transactional outbox in one transaction. No direct Tontine-only status update may represent money movement.
4. **P0 — Callback replay evidence**: verify that payload-mismatch rejection persists. An UPDATE followed by an exception inside the same transaction rolls back the rejection audit; return a committed rejected result or persist the security event in a separate committed transaction.
5. **P1 — Launch/readiness**: implement Prompt 018's explicit readiness controls, signed canonical snapshot, member consent, ARMED preflight, two-person approval and idempotent launch.
6. **P1 — Prompt 004/017**: complete attestation, trust passport grants, verification QR, candidate appeal, waitlist, ambassador permissions, recruitment quotas and lock/snapshot.
7. **P1 — Field/partner**: signed offline envelopes, agent route/assignment, provider adapters, callback signature/freshness contracts, settlement and three-way reconciliation. TMoney/Flooz remain disabled until operator contracts and technical evidence are supplied.
8. **P1 — Web/Flutter**: wire every visible action to the authenticated API and real persisted state; add loading/empty/error/offline/permission-denied/replay states and device E2E. Keep financial figures empty where no API data exists.
9. **P2 — Economic/risk/marketing/federation/AI**: implement prompts 012–016 and 021–029 from complete source prompts, with human decision controls and provenance. Do not invent missing prompts 002, 022, 030, 031 or the truncated tail of 004.

## Release decision

PR #194 remains open and draft. Do not merge or certify. A green CI on a SHA is a necessary gate, not proof of complete Bible coverage, live Mobile Money, or terrain operation.
