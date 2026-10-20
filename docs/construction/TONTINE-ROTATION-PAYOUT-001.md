# Tontine Independent Rotation & Payout Construction Record

## Brick
TONTINE-ROTATION-PAYOUT-001

## Bible/skills consulted
- AGENTS.md
- docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md
- docs/skills/TPAY-CONSTRUCTION-001.md
- docs/skills/TPAY-TONTINE-CYCLE-001.md
- docs/skills/TPAY-FIN-002.md
- docs/skills/TPAY-MF-002.md
- docs/skills/TPAY-SEC-001.md
- docs/security/THREAT-MODEL.md
- docs/architecture/ADR-004-community-tontine.md
- docs/architecture/ADR-005-tontine-cycle-settlement.md
- docs/architecture/ADR-020-payout-beneficiary-rotation.md
- docs/architecture/ADR-021-payout-reconciliation-reversal.md

## Implemented
1. Deterministic beneficiary rotation over active memberships.
2. No hard-coded contribution floor.
3. Net pool calculation from confirmed contributions minus immutable fee snapshots.
4. Beneficiary slot state scheduled -> eligible with single-assignment protection.
5. Tontine payout gate for KYC, unresolved financial exceptions and human approval.
6. Valid deterministic UUID for payout intent.
7. Provider-bound payout initiation without direct Ledger mutation.
8. PostgreSQL schema for groups, memberships, cycles, member schedules and beneficiary slots.
9. Regression tests for rotation, net pool, payout blocking, KYC/approval and provider-pending initiation.

## Security decisions
- Financial exceptions block payout creation.
- Beneficiary identity is bound to membership and client identity.
- Microfinance destination is mandatory.
- Provider initiation produces evidence only; settlement remains a separate Financial Core operation.
- No provider response is treated as posted-money truth.
- No historical ledger mutation is introduced.
- No fixed 500 XOF rule exists.

## Remaining gates
- Real PostgreSQL repository adapters for the new tontine aggregate tables.
- End-to-end payout callback verification through the existing provider contract/callback gate.
- Durable payout state transition persistence and concurrency tests.
- Incident/dispute/refund persistence and workflows.
- Offline contribution-to-settlement integration tests.
- GitHub CI green for this branch/merge head.

## Rollback
The migration is additive. Rollback must be performed through a controlled migration plan after verifying that no production records depend on the new tables. Financial history must never be deleted as a rollback mechanism.
