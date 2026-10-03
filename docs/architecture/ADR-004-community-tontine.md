# ADR-004 — Community Tontine

## Product boundary
Community Tontine is an independent T.Pay product domain. It is interoperable with partner microfinance institutions but does not become a second financial ledger.

T.Pay Financial Core remains the authoritative source of posted financial state. A microfinance partner remains an external/partner system behind adapters. Tontine records express membership, schedules, rules, beneficiary order, contribution intents, provider references, governance and reconciliation state.

## Supported field model
- daily, weekly and monthly cycles
- fixed, variable and goal-based contributions
- member groups with founder/member/treasurer/collector/supervisor roles
- beneficiary rotation and explicit payout slots
- member-chosen microfinance partner
- agent, wallet, mobile money, microfinance, cash point and USSD channels
- e-carnet/digital history with immutable financial references
- offline field collection envelopes with later reconciliation
- notifications for scheduled, pending, confirmed, missed and payout states
- commissions represented by versioned fee snapshots before execution
- reconciliation between Tontine, T.Pay Ledger and partner provider
- governance proposals and member voting where configured
- dispute/exception path through reconciliation rather than silent correction

## Contribution minimum policy
The tontine creator/operator defines `minimumAmountMinor` for each group. There is **no hard-coded 500 XOF floor** in the domain.

This is deliberate: T.Pay's product engine must support local groups, campaigns and partner policies with different minimums. A regulatory, partner, risk or campaign floor may still be imposed, but it must enter through an explicit policy/configuration layer and must never be hidden inside the core domain validator.

The configured minimum is immutable for an already-posted contribution. If a group changes its minimum for future contributions, that change must be versioned, authorized and auditable; it must not retroactively rewrite historical contributions.

## Financial safety
Contributions are idempotent. External callbacks are never treated as ledger truth without provider verification, replay protection and reconciliation. Posted ledger entries are never edited; corrections use compensating transactions.

Beneficiary payout can require KYC and explicit human approval. The rules engine controls this per tontine. High-risk payout must not be auto-confirmed merely because an external provider reports completion.

## Continuity
If an agent is unavailable, the planned client queue can be reassigned without losing the contribution identity. Geolocation is evidence, never the sole authentication factor.

## Security construction gate
- tenant/group authorization on every read/write
- database uniqueness on idempotency keys
- no client-provided balance is trusted
- provider references are untrusted until verified
- no raw KYC, OTP, secret or payment credential in logs
- offline envelopes require integrity protection and replay detection
- fee rules are versioned and locked for an execution
- payout state is explicit and auditable
- a mismatch creates an exception for reconciliation; it never self-heals
- pause/kill-switch capability exists at provider and group boundaries
- configurable minimums are policy data, not frontend-only validation

## Acceptance criteria
- A group can be created with daily/weekly/monthly rules.
- A group can define its own positive contribution minimum.
- A minimum below or above 500 XOF is accepted when policy permits it.
- Contributions below the configured minimum are rejected.
- Members can join and select a partner microfinance without transferring legal administration of the group.
- A contribution can be initiated once and safely replayed.
- A provider completion cannot silently post twice.
- A beneficiary cannot be paid when configured KYC/human gates are missing.
- A provider/ledger mismatch becomes a reconciliation exception.
- A field agent outage does not erase scheduled clients.
- Historical document/e-carnet references remain stable after branding or rule changes.
