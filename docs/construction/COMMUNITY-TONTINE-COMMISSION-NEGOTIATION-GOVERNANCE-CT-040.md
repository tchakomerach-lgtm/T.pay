# Community Tontine — Commission policy and negotiation governance

**Contract:** DB-074 / GAIN-004 to GAIN-008 / CT-040  
**Scope:** Independent Community Tontine  
**Status:** Governance schema and proposer authorization added; negotiation API, UI and full end-to-end acceptance remain release work.

## 1. Who may design a commission

Only these three authorities may create a commission proposal:

1. **T.Pay** — platform pricing authority. Sets the global and product-level pricing boundaries and can submit a proposal within its governance mandate.
2. **Microfinance partner** — may submit a proposal only when the authenticated actor has the scoped microfinance proposer grant and the institution is actively selected/linked to the tontine group.
3. **Community Tontine administrator** — founder or explicitly granted COMMUNITY_ADMIN for the exact organization and group.

Members, ambassadors, collectors, treasurers, secretaries, mediators, agents and ordinary organization administrators cannot create commission policies merely because they hold a general management role. They may only participate in voting or consultation when a separate governance rule explicitly grants that right; they cannot alter a pricing policy directly.

The proposal origin is derived by the authenticated server from Identity Core grants and the active group relationship. It is never trusted from the request body. Legacy rows are marked LEGACY_UNVERIFIED and must not be treated as proof of an authorized proposer.

## 2. Pricing boundary and negotiation

T.Pay owns the non-bypassable pricing guardrails. A negotiable proposal must remain inside the effective bounds resolved from all applicable scopes:

- global T.Pay minimum/maximum;
- country or regulatory minimum/maximum;
- product and transaction-level minimum/maximum;
- risk-tier minimum/maximum.

The effective minimum is the highest applicable minimum. The effective maximum is the lowest applicable maximum. A proposal is rejected if the resulting interval is empty or the proposed rate falls outside it. The guardrail configuration is versioned and auditable; a negotiation cannot override it. The historical Bible also records an absolute 6% floor; its exact assessment base and transaction-level applicability must be mapped explicitly before enforcement, rather than guessed or confused with the separate microfinance-school rate.

The commercial terms are negotiable between the three authorized proposer classes. Negotiation is represented by immutable rounds and counteroffers, not by editing an existing policy in place. Each event records actor, proposer class, round, exact terms, reason, timestamp and SHA-256 hash.

## 3. Commission dimensions

Policies remain independently versioned by transaction level:

- CONTRIBUTION
- BENEFICIARY_PAYOUT
- TRANSFER
- OPTIONAL_SERVICE

Fee components remain explicit: TPAY, PARTNER, AGENT, RESERVE, TAX and OPTIONAL_SERVICE. The payer allocation is explicit: MEMBER, BENEFICIARY or SPLIT. Amounts use integer minor units and rates use basis points. No universal percentage is silently applied to all transaction levels.

The historical 5–10% microfinance-school partnership commission remains a separate signed commercial agreement and must never be copied automatically into Community Tontine pricing.

## 4. Approval, agreement and locking

- The proposal starts as DRAFT.
- The proposer cannot approve their own policy (maker/checker).
- Counteroffers append a new immutable negotiation event; they do not mutate an earlier event.
- An agreement must reference the exact accepted terms and policy version.
- A quote is created from an ACTIVE policy, expires, and must be explicitly accepted.
- The accepted quote/snapshot is bound before Payment Intent creation.
- Settlement writes Ledger, fee snapshot, receipt and outbox atomically through Financial Core.
- A rate change creates a new prospective policy version. It never rewrites a locked quote, accepted snapshot or historical Ledger entry.

## 5. Implementation boundary in CT-040

Implemented in the current branch:
- Identity permission vocabulary for T.Pay, microfinance and community-admin commission proposers.
- Server-side derivation of proposal origin; microfinance proposal requires an active, unexpired staff-to-institution access row and an active group member selected to that institution (migrations 137 and the scoped MF access repository).
- proposal_origin, negotiation state and round metadata on commission policies.
- Append-only, tenant-scoped negotiation-event table with immutable terms and RLS.
- Database guard that blocks retroactive mutation/deletion of commission policy terms while allowing the explicit DRAFT → APPROVED → ACTIVE → RETIRED lifecycle.
- PostgreSQL tests for policy immutability and negotiation-event immutability.

Still required before production certification:
- T.Pay-managed guardrail configuration and the resolver implementing the effective min/max calculation in the policy creation path.
- Negotiation counteroffer/accept/reject API endpoints and complete agreement-to-new-policy-version workflow.
- React and Flutter negotiation UI using DB-074.
- Non-owner/non-BYPASSRLS adversarial tests for proposer classes and cross-organization/group isolation.
- Full quote → acceptance → Payment Intent → verified callback → Financial Core Ledger → snapshot → receipt → outbox E2E on PostgreSQL.
- PostgreSQL, Android and Flutter checks green on the exact final SHA.

No live payment rail, payout or production certification is implied by this document.