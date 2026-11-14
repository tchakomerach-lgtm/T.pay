# Tontine Membership Invitation — Construction Record

## Brick
TONTINE-MEMBERSHIP-INVITATION-002

## Bible / architecture consulted
- `docs/architecture/ADR-004-community-tontine.md`
- `docs/architecture/ADR-005-tontine-cycle-settlement.md`
- `docs/architecture/ADR-020-payout-beneficiary-rotation.md`
- `docs/architecture/ADR-021-payout-reconciliation-reversal.md`
- `docs/skills/TPAY-TONTINE-CYCLE-001.md`
- `docs/skills/TPAY-FIN-002.md`
- `docs/skills/TPAY-MF-002.md`
- `docs/skills/TPAY-SEC-001.md`

## Implemented in this brick
- Authenticated `POST /v1/tontine/groups/:groupId/members` invitation command.
- Group and tenant context are established inside one PostgreSQL transaction.
- Group row is locked before capacity is checked, serializing concurrent invitations to the same group.
- Capacity counts both pending invitations and active memberships.
- Invited identity is validated as a UUID; the caller cannot choose a privileged role.
- New membership is persisted as `role=member,status=pending`; invitation does not grant active participation.
- Optional partner microfinance reference is UUID-validated and stored as a selection, not treated as a verified settlement account.
- Idempotency reservation, membership insert, outbox event and audit record commit or roll back together.
- Replay with the same idempotency key and same request returns the existing membership; a changed request conflicts.
- React workspace exposes the invitation command only with an authenticated API and selected group, with a responsive 3D surface and loading/error states.
- Tests cover successful atomic invitation, capacity exhaustion and malformed client identity.

## Explicit non-goals / remaining gates
- Member acceptance/decline and identity-to-client ownership proof are not implemented in this brick.
- No notification delivery is claimed; the outbox event is durable intent for a separately verified dispatcher.
- No KYC approval, microfinance partner verification, role delegation, suspension, exit, or temporal permission mutation is implemented here.
- No cycle, contribution, collection, payout, ledger or wallet mutation is exposed by this command.
- A live PostgreSQL adversarial test for concurrent invitations and cross-organization isolation remains required before this brick is certified.
- The UI currently accepts a client UUID; a secure client directory/search API with privacy filtering is a separate requirement before field rollout.

## Safety invariants
- Tontine remains an independent domain and never creates a second ledger.
- Financial Core remains the authority for posted financial state.
- A pending invitation is not an active member and cannot receive a beneficiary slot.
- Capacity is enforced under a row lock and by the existing unique membership constraint.
- Provider references, partner selections and frontend state are not payment evidence.

## Rollback
The implementation is additive and uses existing tontine membership, outbox and idempotency tables. Do not delete financial history or membership history as a rollback strategy.
