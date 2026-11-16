# Community Tontine — Incident & Dispute Intake

## Bible references
- `docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md`
- `docs/architecture/ADR-004-community-tontine.md`
- `docs/architecture/ADR-005-tontine-cycle-settlement.md`
- `docs/architecture/ADR-006-tontine-settlement-orchestrator.md`
- `docs/architecture/ADR-021-payout-reconciliation-reversal.md`
- `docs/construction/COMMUNITY-TONTINE-MF-24-SEQUENCES.md`
- `packages/microfinance/src/tontine-case.ts`

## Delivered in this construction slice
- Authenticated `POST /v1/tontine/groups/:groupId/cases` route, non-financial by policy.
- Organization permission `org.manage`; tenant and organization context set transaction-locally.
- Group row locked before case creation.
- Supported case types: incident, dispute, risk investigation, recovery and refund request.
- Severity and summary validation; refund cases require a contribution or payout reference.
- Optional contribution reference is locked and checked against the same organization and group.
- Optional payout reference is checked through its beneficiary slot against the same organization and group.
- Idempotency reservation, case insert, outbox event, audit record and response hash are committed in one PostgreSQL transaction.
- Replay returns the original case; a key reused with a different payload fails closed.
- React workspace provides a responsive 3D-depth intake surface with type, severity, financial reference and summary fields.
- UI explicitly states that opening a case does not change balances or trigger a refund.

## Safety boundary
This endpoint opens an investigation workflow only. It does not transition an existing case, upload evidence, approve a refund, call a provider, post a ledger entry or execute a payout. Refund settlement remains a Financial Core operation and must use a separate maker/checker and reconciliation workflow.

## Tests added
- Successful transactional case intake with group lock, contribution lock, audit and outbox.
- Cross-group / missing contribution reference rejection.
- Refund case without original financial reference rejection.
- API gateway policy test for authenticated non-financial POST route.

## Remaining release gates
- Add PostgreSQL live integration coverage for case creation, RLS/tenant isolation, idempotent concurrent replay and rollback.
- Add case transition command using the domain state machine; enforce actor roles and temporal permissions.
- Add append-only evidence registration and evidence integrity/object-storage lifecycle.
- Add targeted holds with expiry and explicit release controls.
- Add refund request workflow with distinct maker/checker and Financial Core adapter; no direct ledger writes.
- Verify the payout reference query against the deployed Financial Core schema and live migration chain.
- Add Web/Flutter parity for the case workflow under DB-074.
- Full current-HEAD CI and field evidence remain mandatory; this record does not certify production readiness.
