# Community Tontine — Prompt 001–031 integration register

**Status:** construction register; not a certification document.
**Target:** `tchakomerach-lgtm/T.pay`, branch `feat/community-tontine-prompt-001-031`.
**Rule:** a prompt is complete only when its exact Bible requirements are traced to implementation, UI/API, persistence, authorization, tests and CI evidence.

## Domain invariants (apply to all 31 prompts)

1. Community Tontine is an independent product domain. A partner microfinance supplies scoped services; it does not own community constitution, rotation, votes or group administration.
2. T.Pay Financial Core is the sole authority for posted money. Tontine has no parallel ledger.
3. Provider response/callback is evidence, not settlement. `provider_pending` and provider-reported completion are not a confirmed contribution or payout.
4. Every financial command is tenant/group scoped, idempotent, auditable and concurrency-safe.
5. Offline capture is a signed operational intent only; it cannot mutate balances or Ledger.
6. Fee/commission rules and minimum contribution are versioned policy data. No universal hard-coded contribution floor or commission rate.
7. Mismatch, dispute, replay, timeout or uncertain status fails closed and opens reconciliation; never self-heal silently.
8. Historical events and posted Ledger entries are immutable; correction uses compensating Financial Core transactions.

## Prompt source integrity

The current repository exposes the general tontine architecture and implementation skills, plus historical references for Prompt 001, Prompt 003 and Prompt 028. It does **not** currently contain the authoritative full text/title of all prompts 001–031 as a single source. This register therefore does not invent the missing prompt titles or requirements. The complete Bible source must be imported into `docs/bibles/` before the 31 individual prompts can be certified as faithfully implemented.

| Prompt | Requirements recoverable from current records | Existing implementation evidence | Status |
|---|---|---|---|
| 001 | Foundations, scope, architecture, roles, states, workflows, rules engine, scheduler, contributions, idempotency, offline, governance, risk/AI, audit, APIs, tenancy, integrations, observability, tests and acceptance criteria | `ADR-004-community-tontine.md`, `TPAY-TONTINE-CYCLE-001.md`, `community-tontine.ts`, `community-tontine-service.ts`, cycle/rules/reconciliation modules | Partial; UI/API wiring and full evidence required |
| 002 | Full authoritative prompt text not present in current repository/context | Not safely attributable without source text | Source required |
| 003 | Ultra-secure independent Tontine ↔ Microfinance integration: partner connectors, identity mapping/consent, payment intents/webhooks, routing, reconciliation, settlement, credit separation, disputes/audit and kill switch | `community-tontine-mf-*.ts`, migrations 106–114, settlement repository/approval tests | Partial; live provider and full end-to-end proof required |
| 004–027 | Full authoritative prompt texts not present in current repository/context | Existing modules may cover overlapping capabilities; no prompt-level attribution is asserted | Source required |
| 028 | Unified Trust Fabric for human/org/community/device/session/document/transaction/AI identities; passkeys/WebAuthn, attestations, RBAC/ABAC, intent provenance, offline signatures, recovery, security events, KYA, keys, privacy and deployment phases | Identity/passkey/security contracts and tontine offline envelope exist; integration coverage must be demonstrated | Partial; cross-domain binding and end-to-end tests required |
| 029–031 | Full authoritative prompt texts not present in current repository/context | No prompt-level attribution is asserted | Source required |

## Current implementation map (not a substitute for the prompt texts)

- **Domain and rules:** `community-tontine.ts`, `tontine-rules.ts`, `tontine-cycle.ts`, `tontine-rotation.ts`.
- **Contribution and payout orchestration:** `community-tontine-service.ts`, `tontine-payout.ts`, `tontine-payout-orchestrator.ts`, `tontine-payout-settlement.ts`.
- **Persistence and isolation:** `tontine-repositories.ts`, `community-tontine-mf-repositories.ts`, migrations 100–114.
- **Provider callbacks and reconciliation:** `tontine-provider-callback.ts`, `tontine-reconciliation.ts`, `tontine-receipt-evidence.ts`.
- **Offline and continuity:** `tontine-offline.ts`, migration 102.
- **Governance, cases and intelligence:** `tontine-governance.ts`, `tontine-governance-policy.ts`, `tontine-case.ts`, `tontine-economic-network.ts`, `tontine-intelligence.ts`.
- **Partner microfinance:** `community-tontine-mf-operations.ts`, `community-tontine-mf-approval.ts`, `community-tontine-mf-settlement-repository.ts`.
- **Tests:** `tests/community-tontine*.test.ts`, `tests/tontine-*.test.ts`.

## Defect fixed in this construction increment

`initiateContributionPayment` previously emitted `tontine.contribution.confirmed` when a provider initiation response said `completed`. That conflated provider-reported status with verified Financial Core settlement. It now keeps the domain result `pending`, exposes the provider-reported status separately, and emits `provider_reported_completed` as evidence only. A regression test asserts that this path never emits a confirmed event.

## Release and UI/API integration gates

- Publish the exact Bible prompts 001–031 under `docs/bibles/` and map every requirement to a stable requirement ID.
- For each requirement, record: domain rule, screen/state, API route, authorization policy, DB constraint/migration, audit event, test ID, observability signal and acceptance evidence.
- Wire real authenticated API routes and Web/Mobile screens to the domain services; domain TypeScript modules alone do not constitute a usable application interface.
- Add PostgreSQL live/concurrency tests for contribution idempotency, beneficiary claims, provider replay, tenant isolation, maker/checker and rollback.
- Run typecheck, unit tests, PostgreSQL integration, security fortress, web build, dependency audit and Android build on the exact candidate SHA.
- Keep release blocked until GitHub Actions has assigned a real runner and all required jobs have executed successfully. A job failing with runner_id 0 and no steps/logs is an infrastructure blocker, not a source test result.

## Acceptance rule

No prompt is marked complete based on a filename, a planned component, a mock, a domain-only function or a test that did not execute. Completion requires the authoritative prompt text, production implementation, real persistence/API/UI wiring, negative security tests, live PostgreSQL evidence where applicable and green CI on the exact SHA.
