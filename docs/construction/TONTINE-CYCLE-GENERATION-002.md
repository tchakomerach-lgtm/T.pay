# Community Tontine — Cycle Generation Brick

## Brick
TONTINE-CYCLE-GENERATION-002

## Architectural sources
- `docs/architecture/ADR-004-community-tontine.md`
- `docs/architecture/ADR-005-tontine-cycle-settlement.md`
- `docs/architecture/ADR-020-payout-beneficiary-rotation.md`
- `docs/skills/TPAY-TONTINE-CYCLE-001.md`
- `docs/skills/TPAY-FIN-002.md`
- `docs/skills/TPAY-SEC-001.md`

## Implemented in this brick
- Authenticated `POST /v1/tontine/groups/:groupId/cycles` command.
- Only active groups can generate a cycle.
- Group row is locked before reading cycle number and active membership set.
- At least two active members are required.
- Cycle date range and immutable rules-version label are validated before transaction.
- Cycle snapshots the group's configured minimum and currency.
- Each active membership receives a schedule row in the same PostgreSQL transaction.
- Beneficiary slots are generated in deterministic order, prioritizing the lowest/oldest paid-cycle history and then membership join time and ID.
- The candidate order is a scheduling artifact, not payment authorization; eligibility and prior payout history must be re-evaluated at payout time.
- Expected schedule amount uses the fixed group amount for fixed groups and the configured minimum for variable/goal groups.
- Beneficiary target is calculated with integer arithmetic only.
- Group cycle counter advances under the same row lock.
- Idempotency reservation, cycle, schedules, beneficiary slots, group counter, audit and outbox event commit or roll back together.
- Web UI exposes date/rules controls and truthful loading/error states, with responsive 3D motion styling and reduced-motion support.

## Financial and security boundaries
- No contribution is confirmed by schedule generation.
- No payment intent, provider call, ledger posting, commission, receipt or payout is created here.
- Financial Core remains the sole authoritative posted-money source.
- Payout eligibility, KYC, human approval, unresolved exception checks and settlement remain separate mandatory gates.
- A generated beneficiary sequence is not a promise to pay.

## Required follow-up gates
- Real PostgreSQL tests for concurrent cycle generation on one group, idempotent replay, uniqueness and tenant isolation.
- Test fixed, variable and goal schedules against partner and group policy versions.
- Add policy snapshot/version references beyond the rules-version label.
- Validate group pause/suspension and member-exit effects on already generated schedules.
- Reconcile schedule creation with the domain repository adapters rather than leaving duplicate persistence paths.
- Full field E2E across signed offline collection, provider verification, Financial Core posting, e-carnet, reconciliation, beneficiary eligibility and payout.
