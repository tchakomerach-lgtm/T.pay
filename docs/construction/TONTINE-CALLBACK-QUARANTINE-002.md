# TONTINE-CALLBACK-QUARANTINE-002 — Durable callback replay quarantine

## Scope
Correct the community-tontine provider callback integrity boundary when a provider reuses an event identifier with a different payload or payout binding.

## Mandatory references consulted
- `AGENTS.md`
- `docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md`
- `docs/skills/TPAY-CONSTRUCTION-001.md`
- `docs/skills/TPAY-TONTINE-CYCLE-001.md`
- `docs/skills/TPAY-FIN-002.md`
- `docs/skills/TPAY-MF-002.md`
- `docs/skills/TPAY-SEC-001.md`
- `docs/security/THREAT-MODEL.md`
- `docs/architecture/ADR-004-community-tontine.md`
- `docs/architecture/ADR-020-payout-beneficiary-rotation.md`
- `docs/architecture/ADR-021-payout-reconciliation-reversal.md`
- `migrations/101_tontine_durability_callbacks.sql`
- `packages/microfinance/src/tontine-provider-callback.ts`

## Root cause
The previous implementation updated a conflicting callback receipt to `rejected` and then threw inside the same database transaction. The transaction rollback erased the rejection evidence. The caller saw an error, but the durable integrity barrier did not retain the quarantine state.

## Implemented
1. Conflicting provider event ID / payload hash / payout binding updates the durable receipt to `rejected` with `CALLBACK_PAYLOAD_MISMATCH`.
2. The transaction returns a rejected receipt instead of throwing after the state change, allowing the quarantine record to commit.
3. A previously rejected event remains rejected even if a later retry restores the original body. Clearing quarantine requires an explicit incident/reconciliation process, not a callback retry.
4. A stale `received` receipt is quarantined with `CALLBACK_RECEIPT_STALE`; it is never silently treated as a successful replay.
5. Identical replay of a processed event returns `replayed` without rewriting the original processed receipt or invoking Financial Core again.
6. Regression coverage checks durable rejection, sticky quarantine and exactly-once settlement bridge invocation.

## Financial and domain boundary
- Community Tontine remains a separate product domain.
- This callback path is not a second ledger.
- Financial Core remains the sole authority for posted balances.
- Provider evidence is verified and bound to organization, payout, amount and currency before the settlement bridge is called.
- No notification or user-facing status should treat provider acceptance as posted settlement.

## Validation status
The regression test was updated but has not been executed in this environment. Required checks: `npm run typecheck`, `npm test`, `npm run test:postgres`, Security Fortress and CI for the exact final SHA. No production-readiness claim is made.

## Remaining Tontine gates
Durable payout intent state transitions, provider callback integration against the real Financial Core UoW, incident/dispute/refund persistence, offline field replay tests and end-to-end reconciliation remain separate required bricks.
