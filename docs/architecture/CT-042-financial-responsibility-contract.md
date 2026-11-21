# CT-042 — Financial Responsibility and Insurance Intermediation Contract

Status: product/business rule approved by product owner; implementation contract to be validated.
Scope: Community Tontine protection premiums and individual protection subscriptions.

## 1. Parties and legal capacity

- The insured member is the policyholder/insured party for an individual subscription and bears that individual premium.
- For a community subscription, the community tontine funds the premium through the explicitly authorized deduction from each beneficiary's distributable amount, according to the approved tontine decision and disclosed allocation formula.
- The actual insurance provider is the insurer. The insurance contract, coverage, exclusions, claims decision and insurance benefit obligation belong to that insurer.
- T.Pay is a technology, payment orchestration, recordkeeping and execution-control intermediary.
- The microfinance institution is an operational/payment-control intermediary where mandated by the workflow. It is not the insurer and does not guarantee the tontine, members, premiums or insurance claims.
- Neither T.Pay nor the microfinance institution may be represented in UI, contracts, receipts or marketing as an insurer, underwriter, guarantor or claims obligor.

T.Pay and the microfinance institution must not promise coverage, reimburse a claim from their own balance sheet, or assume an insurer's obligation. They may verify that a valid insurer contract and payment evidence exist and relay claim/status information without deciding insurance coverage.

## 2. Funding mode A — Individual subscription

1. Each member may independently choose whether to subscribe.
2. The member selects an available insurer/product and receives the premium, coverage, exclusions, term and cancellation information before consent.
3. The member gives explicit, attributable consent to the exact offer and premium.
4. The premium is funded by that member only. No other member's share or community fund may be charged.
5. The member may view the subscription, due dates, payment status and receipts.
6. A change of premium, coverage or insurer requires renewed consent.
7. Non-subscription or non-payment must not silently create a community liability or reduce another member's payout.

## 3. Funding mode B — Community subscription

1. The tontine administrator may propose a community insurance product at tontine creation or during the tontine lifecycle.
2. The proposal identifies the insurer, policy/product, coverage, exclusions, premium, covered population, allocation formula, per-beneficiary deduction, effective dates and cancellation/renewal terms.
3. The proposed funding source is the community tontine distribution: the disclosed premium share is deducted from each beneficiary's amount to be collected/distributed, then settled to the insurer under the approved payment workflow.
4. A member vote may be offered; the vote is optional as a product workflow, not a mandatory feature in every tontine.
5. The administrator's proposal alone must not trigger a debit. Before activation, the system must establish the applicable authority: a valid tontine rule/mandate accepted by members, or an explicit approval/consent process required by the tontine's governing rules and applicable law. If that authority is absent or ambiguous, keep the proposal in DRAFT/PENDING and do not deduct.
6. If a vote is held, persist the eligible electorate snapshot, question and exact offer version, opening/closing times, one-person-one-vote controls, vote changes (if permitted), tally, quorum/threshold rule, result and audit trail. Never infer a threshold; it must be configured by the tontine's approved rules before voting opens.
7. The system must disclose each beneficiary's gross entitlement, premium deduction, other authorized deductions and net payout before the beneficiary confirms/receives the distribution.
8. No retroactive deduction is allowed. A new or changed premium, insurer, coverage, allocation formula or covered population requires a new authorization and prospective effective date.
9. A member's individual opt-out/withdrawal rights and the effect on community coverage must be shown before activation and handled according to the policy and governing rules. Do not invent an opt-out where the collective contract legally binds the group; require legal/product configuration for that case.
10. If the community decision is rejected, expires, lacks authority or the insurer contract is invalid, no premium is deducted and the tontine distribution proceeds without that insurance deduction.

## 4. Financial Core boundary

- Financial Core remains the sole authority for payment intents, reservations, ledger postings, settlement, reversals and reconciliation.
- CT-042/Microfinance may request a payment intent and provide business context; it must never write directly to Ledger tables or fabricate a settled state.
- A beneficiary payout and its authorized insurance deduction must be computed and committed atomically or through a Financial Core-controlled settlement unit of work. Never debit the same beneficiary twice.
- Premium settlement must be idempotent, keyed by stable business references (tontine, cycle, beneficiary, policy/offer version and premium obligation).
- No premium may be marked PAID until a verified Financial Core settlement result exists. A failed/expired payment intent leaves the premium unpaid and must not reduce the payout.
- The insurer payee and settlement destination must be verified against the insurer's approved onboarding/contract data. T.Pay and the microfinance institution are not default payees for premium funds.
- Use immutable commission/fee snapshots where applicable; disclose any intermediary fee separately from the insurance premium.

## 5. Roles and permissions

- Member: view own offer/coverage/premium/receipts; manage individual subscription; vote if eligible; view own gross-to-net payout.
- Tontine administrator: create/edit a proposal before authorization; initiate an optional vote; view group execution status. Cannot fabricate consent, alter closed votes, approve their own privileged settlement or bypass Financial Core.
- Microfinance operator: perform assigned verification/control steps only; no insurance underwriting or guarantee authority.
- T.Pay operations: technical validation, reconciliation, audit and exception handling under scoped, time-bound permissions; no insurer/guarantor authority and no unrestricted access to private member records.
- Insurer: own policy/coverage/claims decisions through its authorized contract and integration.
- Maker/checker: separate proposal/payment initiation from approval/settlement where the risk policy requires it. No self-approval for privileged financial operations.

## 6. Required data and audit evidence

Persist immutable references for:
- funding mode (INDIVIDUAL or COMMUNITY);
- member/tontine/organization/cycle/beneficiary IDs;
- insurer legal identity and verified contract/product reference;
- exact offer/policy version and premium currency/amount;
- consent/mandate source, actor, timestamp and version;
- optional vote snapshot, ballots, eligibility, configured quorum/threshold and result;
- allocation formula and per-beneficiary gross/deduction/net amounts;
- payment intent, idempotency key, settlement reference and reconciliation status;
- audit/outbox event IDs and correlation IDs;
- cancellations, reversals, disputes and exception decisions.

Apply PostgreSQL tenant isolation and row-level security to every tenant-owned record. Enforce unique constraints and transactional locks so concurrent payout/settlement attempts cannot double-deduct or double-pay. Keep an append-only audit trail; do not rely on application-only checks for authorization.

## 7. TMoney/Flooz and operator integration

TMoney/Flooz adapters remain disabled until actual operator integration contracts, credentials, callback specifications, signature/verification requirements, sandbox or certification evidence and reconciliation procedures are supplied and approved. Existing technical interface contracts in the repository do not prove an active operator connection.

## 8. Acceptance tests / release gates

- Individual member A can subscribe and pay; member B and community funds remain unchanged.
- No individual debit without explicit consent to the exact offer version.
- Community proposal without a valid mandate/approval remains non-collectible.
- Optional vote can be enabled or omitted according to configured rules; no implicit quorum or threshold.
- Vote result is immutable/auditable and bound to the exact offer version.
- Beneficiary gross amount, premium deduction and net payout reconcile exactly.
- Concurrent duplicate requests cannot double-deduct or double-settle.
- Cross-organization reads/writes are rejected under non-privileged PostgreSQL roles with RLS enabled.
- Failed, expired, replayed or unsigned provider callbacks cannot mark premiums paid or post ledger entries.
- Only Financial Core can settle; CT-042 cannot mutate Ledger directly.
- UI receipts identify the actual insurer and clearly state that T.Pay/microfinance are intermediaries, not insurer or guarantor.
- Web and Flutter display matching funding mode, consent, vote, deduction and settlement state.
- Real operator/terrain proof is required before production claims. Compilation and mocked tests alone are insufficient.

## 9. Explicit non-goals

This contract does not make T.Pay or the microfinance institution an insurer, guarantor, lender of last resort or claims payer. It does not authorize automatic deductions without a valid mandate. It does not activate TMoney/Flooz. It does not define a vote quorum, premium percentage, insurance product or legal opt-out rule; those require approved configuration and the actual insurer/tontine documents.
