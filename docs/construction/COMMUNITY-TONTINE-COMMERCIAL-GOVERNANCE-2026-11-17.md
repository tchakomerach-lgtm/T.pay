# Community Tontine — commercial governance implementation record

**Date:** 2026-11-17  
**Branch:** `feat/community-tontine-prompt-001-031`  
**Scope:** additive implementation slice for the reconstructed CT-001–CT-038 requirements and historical GAIN rules.  
**Status:** implementation foundation added; not production-certified.

## Historical Bible rules preserved

The commercial design reuses the existing T.Pay Finance commission calculator (`packages/finance/src/commission.ts`) and the canonical settlement unit of work. It does not introduce a second Ledger or a second generic commission calculator.

Cross-references recovered from the historical GAIN Bible:
- **GAIN-004 — Commission Engine:** configurable percentage by transaction level; no hard-coded universal rate.
- **GAIN-005 — Ledger:** Financial Core is the authoritative double-entry source; posted entries are immutable and corrected by compensating entries.
- **GAIN-006 to GAIN-008:** fee allocation, settlement and related revenue controls; preserve their versioned policy/snapshot boundary.
- Fee quote and fee snapshot are locked before acceptance/payment execution.
- Payer can be member/customer, beneficiary/seller, or split, according to the accepted terms.
- T.Pay, partner, agent, reserve, tax and optional-service fees are represented separately.
- Revenue allocation is explicit; no surprise fee may be added after acceptance.
- Commission policy is versioned and auditable; a rate change applies prospectively only.

**Important separation:** the historical 5–10% negotiable T.Pay share of a microfinance institution's monthly commissions belongs to the separate school/microfinance partnership model. It is not silently applied to a Community Tontine contribution. Any such relationship requires its own signed commercial contract and policy.

## Implemented in this slice

### 1. Versioned commission policy and accepted fee snapshots
- New domain contract: `packages/microfinance/src/community-tontine-commercial-governance.ts`.
- Transaction levels: contribution, beneficiary payout, transfer and optional service.
- Components: T.Pay, partner, agent, reserve, tax and optional service.
- Integer basis-point rates and integer minor-unit calculations through the existing Finance `calculateCommission` function.
- Payer modes: member, beneficiary or split.
- Commission policy canonical SHA-256 hash; maker/checker approval; effective time window.
- Quote expiry, quote hash, acceptance timestamp and immutable snapshot hash.
- Contribution snapshot is bound to the exact contribution and must be accepted before payment-intent creation.
- Existing legacy fee snapshots remain supported during migration; new snapshots can carry the expanded allocation.

### 2. PostgreSQL persistence
Migration `133_community_tontine_commissions_promotions_roles.sql` adds:
- Versioned commission policies and immutable policy audit.
- Organization-scoped immutable fee snapshots with expanded fee components and quote/snapshot hashes.
- Temporal group role grants.
- Promotion campaigns and attributed redemptions with quota, budget and idempotency barriers.
- Organization RLS on the new persisted records.

The settlement PostgreSQL adapter writes the expanded snapshot inside the existing atomic Financial Core settlement transaction. The migration is additive and retains legacy two-component fee rows.

### 3. Administrator and delegated permissions
- Roles: founder, community administrator, president, treasurer, secretary, collector, controller, mediator, payout approver and member.
- Explicit capabilities instead of a single broad administrator boolean.
- Temporal grants are bound to organization and group, with valid-from, expiry and revocation.
- Self-grant is rejected.
- Payout approval cannot be delegated through ordinary community-admin role grants; maker/checker remains a separate governance boundary.
- No Super Admin implicit right to read private member or group financial data.

### 4. Promotions and recruitment rewards
- Campaign lifecycle: draft → approved → active → paused/ended.
- Campaign code, time window, allowed channels, redemption quota and maximum budget.
- Redemption attribution is idempotent and budget/quota reservation is an atomic PostgreSQL transaction.
- Self-referrals are rejected.
- Attribution does not create a payable reward.
- Reward becomes pending approval only after candidate verification, accepted membership, first contribution confirmed by Financial Core and a clear fraud review.
- Reward payment itself is not executed by this slice; it must be approved and settled by Financial Core through a dedicated payout command.

## Files changed

- `packages/microfinance/src/community-tontine-commercial-governance.ts`
- `packages/microfinance/src/community-tontine-commercial-repository.ts`
- `packages/microfinance/src/community-tontine.ts`
- `packages/microfinance/src/tontine-settlement.ts`
- `packages/microfinance/src/tontine-settlement-uow.ts`
- `packages/finance/src/postgres-settlement-uow.ts`
- `migrations/133_community_tontine_commissions_promotions_roles.sql`
- `tests/community-tontine-commercial-governance.test.ts`

## Remaining blockers — do not certify

1. Wire commission policy creation/approval/activation, quote acceptance and promotion/role endpoints into the authenticated Community Tontine API runtime.
2. Ensure the API derives tenant, organization, group and actor only from the verified Identity Core context; never from request-body claims.
3. Connect React and Flutter administrator, commission, promotion and reward-review screens to those real endpoints; no demo values.
4. Add PostgreSQL live tests for migration 133, RLS under a non-owner/non-BYPASSRLS runtime role, commission policy maker/checker concurrency, active-policy replacement, promotion quota/budget races, duplicate redemption, reward evidence and immutable fee snapshots.
5. Add end-to-end proof that accepted quote → payment intent → verified callback → Financial Core ledger + expanded fee snapshot + receipt + outbox is one atomic settlement.
6. Add a dedicated Financial Core reward-disbursement command with approval, idempotency, ledger reference and reversal handling. A pending referral reward is not a payment.
7. Complete real Android/Flutter and Web journeys and run all required CI checks on the exact resulting SHA.
8. Verify signed TMoney/Flooz/aggregator contracts before enabling live operator traffic.

## Acceptance boundary

This record documents code and schema additions only. It does not claim that API routes, UI journeys, operator rails, live PostgreSQL tests, Android terrain tests or production certification are complete. No merge is authorized until the mandatory PostgreSQL + Android + Flutter gates pass on the exact commit.
