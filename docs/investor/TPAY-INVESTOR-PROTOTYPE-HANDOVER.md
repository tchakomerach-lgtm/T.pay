# T.Pay Investor Prototype — Handover

Status: INTERACTIVE DEMO BRANCH — NOT PRODUCTION CERTIFIED  
Branch: `investor/tpay-os-prototype`  
Purpose: investor presentation, product discovery, workflow validation and senior engineering handover.

## Product narrative

T.Pay is presented as a modular operating system connecting identity, organizations, operational verticals, commerce/opportunities, a canonical Financial Core, AI orchestration and platform governance.

The investor journey is:

Identity & Trust → Organization OS → Operational workflows → Financial Core → Partner ecosystem → AI Core → Governance & audit.

## Prototype coverage matrix

| Domain | Demonstrated surface | Prototype interactions | Production boundary |
|---|---|---|---|
| Experience OS | Home, navigation, context, search, notifications | Navigation, global search, reset, tour | Real session/context and API authorization not connected |
| Organizations | Directory, creation, sector, brand setup | Create organization, switch active context | Organization service, membership and logo storage required |
| Education | Students, teachers, classes, attendance, subjects, grades, bulletins | Add student, switch tabs, inspect document preview | Existing authenticated Education APIs, PostgreSQL, RLS and Outbox remain authoritative |
| School Subsidy | School call, MFI guarantor, annual cahier des charges, supplies packs, daily tontine recovery, school-fee recovery and 1–5% negotiable commission | Create illustrative request | No credit, guarantee, funds or recovery is executed |
| Microfinance | Client, agent, supervisor, agency, SFD, KYC, portfolio and repayment | Add fictional client | KYC, credit and collections require real service controls and partner contracts |
| Community Tontine | Group, membership, cycle, governance, rotation, disputes | Create group | Durable repositories, callbacks, reconciliation and Financial Core bridge required |
| Financial Core | Payment intent, settlement, ledger, fees, commissions, reconciliation | Simulated intent | No live payment provider; canonical ledger remains backend-owned |
| Wallet | Account overview and transaction history | Demo movement | No balance mutation or real transfer |
| Marketplace | Products, suppliers, procurement and orders | Simulated order | Inventory, order, payment and delivery services required |
| Opportunity & Work | Skills, matching, applications, contracts, delivery, reputation | Publish opportunity | Matching is advisory; contracts and payments need authorization and workflow services |
| Social & Growth | Organization feed, communities, moderation | Create post, like | Consent, tenant scope, moderation and channel adapters required |
| Investment Core | Opportunity, risk, liquidity, provenance and scenarios | Scenario capture | No investment execution, guaranteed return or unlicensed intermediary behavior |
| AI Core | Specialist agents, sources, policy, human approval and trace | Prepare analysis | No provider adapter, autonomous financial mutation or unapproved outbound contact |
| Documents | Versioned templates, organization branding, watermark | Create template, preview | Secure document storage, signing and template governance required |
| Workflow & Projects | Tasks, stages, SLA, dependencies and approvals | Create/advance task | Durable workflow engine, audit and temporal permissions required |
| Calendar & Reservations | Meetings, resources, priority and conflict policy | Capture reservation | PostgreSQL conflict constraints and approval rules required |
| Super Admin | Roles, temporary permissions, audit, security and recovery | Inspect demo controls | FIDO2/WebAuthn, PAM/JIT, KMS/HSM, quorum, RLS and red-team gates remain production requirements |
| Additional verticals | Agriculture, transport, health, hospitality and public services | Discovery cards | Separate domain implementation and regulatory review required |

## Non-negotiable architecture boundaries

1. Financial Core is the only authority for financial postings. Do not create a second ledger in any vertical.
2. Education must not store or mutate school-fee balances. It requests financial actions through the Financial Core.
3. Community Tontine and daily tontine for school-supply recovery remain distinct domain models.
4. AI may read, analyze, simulate, explain and prepare; policy, authorization and human approval control execution.
5. External providers remain behind typed, contract-bound adapters; signed callbacks require freshness, signature validation, replay protection and reconciliation.
6. Tenant and organization isolation is enforced server-side and in PostgreSQL RLS; UI hiding is not authorization.
7. Offline operations are intents until server reconciliation; local state is never final financial settlement.
8. Every consequential mutation requires idempotency, audit and the correct transactional Outbox boundary.
9. The frontend must consume the DB-074 design contract as the single Web/Mobile design source; do not create competing design systems.
10. Secrets, KYC payloads, OTPs and payment credentials never enter demo data, logs or client-side source.

## How to run

See `apps/investor-demo/README.md`. The prototype uses fictional browser-local data and can be reset at any time. Build with `npm run investor:build`.

## What this is not

This is not the complete implementation of every Bible requirement. It is a broad, interactive product demonstration that makes the intended modules and workflows tangible. Production readiness still requires backend/API coverage, database constraints, real PostgreSQL integration, least-privilege RLS, adversarial tests, provider contracts, Android/Web field tests, observability, backup/restore, threat review and green CI on the exact release commit.

## Senior team takeover plan

- **Platform/architecture:** review bounded contexts, DB-074 contract layer, event fabric, API gateway and service ownership.
- **Security:** finish identity lifecycle, WebAuthn/step-up, tenant RLS, PAM/JIT, key management, abuse controls and red-team.
- **Finance:** validate immutable ledger, settlement, commissions, subsidy accounting, provider callback replay and reconciliation.
- **Education/Microfinance/Tontine:** finish persistent repositories, state machines, offline reconciliation and end-to-end workflows.
- **AI:** finish AI Core orchestration, capability broker, policy evaluation, consent, tool audit and specialist evaluations.
- **Frontend/mobile:** migrate prototype surfaces to the shared React/Flutter renderer and DB-074 design contract; implement accessibility, low-bandwidth and offline conflict UX.
- **SRE/QA:** run the complete CI suite, PostgreSQL 17 with non-owner NOBYPASSRLS runtime, concurrency/replay tests, Android/Web terrain evidence, monitoring and disaster recovery.

A module must be marked **production-ready** only when its own Definition of Done and release gates are evidenced. The investor prototype status must never be used as a substitute for those gates.
