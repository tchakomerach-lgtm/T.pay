# Tontine Durability & Reconciliation Construction Record

## Scope
Sequence after independent rotation/payout implementation:
- durable PostgreSQL repositories;
- database-level beneficiary claim barrier;
- signed provider callback persistence/replay barrier;
- offline field operation envelope and reconciliation guards;
- incident/dispute/recovery/refund persistence.

## Implemented
1. `tontine-repositories.ts`
   - group, membership and beneficiary-slot repositories;
   - explicit organization scoping;
   - cycle-scoped beneficiary persistence;
   - conditional beneficiary claim;
   - transaction boundary abstraction.
2. `045_tontine_durability_callbacks.sql`
   - callback receipt deduplication by provider event;
   - payload hash uniqueness;
   - operational callback state;
   - beneficiary claim index.
3. `tontine-provider-callback.ts`
   - provider-specific verification remains behind the existing verifier boundary;
   - exact organization/payout/amount/currency binding;
   - durable receipt before Financial Core settlement;
   - replay becomes a terminal operational result;
   - actual ledger settlement injected through Financial Core bridge.
4. `tontine-offline.ts`
   - Ed25519-signed operation envelopes;
   - expiry;
   - monotonic device sequence;
   - anti-replay;
   - explicit prohibition of offline ledger mutation;
   - conflict classification.
5. `046_tontine_offline_operations.sql`
   - durable signed operation inbox.
6. `tontine-case.ts`
   - incident/dispute/risk/recovery/refund state machine;
   - targeted hold model;
   - evidence model;
   - refund workflow separated from ledger execution.
7. `047_tontine_cases_refunds.sql`
   - durable case/evidence/hold/refund records.
8. `tests/tontine-durable-reconciliation.test.ts`
   - offline signature/replay;
   - offline financial-mutation refusal;
   - unsafe case transition;
   - conditional beneficiary claim.

## Safety decisions
- Tontine never becomes a second ledger.
- Provider callback is evidence, not settlement by itself.
- Financial Core remains the only financial posting authority.
- Offline mode never authorizes uncontrolled balance mutation.
- Reversal/refund is never a silent update.
- Database constraints are used as concurrency barriers instead of relying only on application checks.
- No contribution minimum is hard-coded.

## Remaining release gates
- Execute migrations 044-047 against a real PostgreSQL instance.
- Add live PostgreSQL concurrency tests with two concurrent workers.
- Bind the real existing provider callback verifier/registry and test signature, freshness, replay and provider-event uniqueness.
- Add full offline capture -> sync -> reconciliation -> contribution confirmation E2E.
- Add dispute/refund integration through Financial Core.
- Run complete build/typecheck/unit/live-Postgres CI.
- Review migration rollback/forward-only policy and operational backup restore.
- Only then consider this Tontine sequence production-ready.
