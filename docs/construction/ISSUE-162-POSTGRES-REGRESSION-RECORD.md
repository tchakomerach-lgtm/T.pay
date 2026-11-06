# Issue #162 — PostgreSQL integration regression repair

## Scope
Repair the three live PostgreSQL failures recorded against P057.2 commit `66ce63e4a23e90dc2f5cff7d8ec2deb305dc9b18`. This change does not alter P057 authorization semantics, financial posting rules, or capacity enforcement.

## Canonical references consulted
- `AGENTS.md`
- `docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md`
- `docs/bibles/IMPLEMENTATION-MAP.md`
- `docs/skills/TPAY-CONSTRUCTION-001.md`
- `docs/skills/TPAY-MF-002.md`
- `docs/skills/TPAY-FIN-002.md`
- `docs/skills/TPAY-SEC-001.md`
- `migrations/100_tontine_independent_rotation_payout.sql`
- `migrations/109_community_tontine_mf_settlement_instructions.sql`
- `migrations/114_tontine_composite_tenant_isolation.sql`
- `tests/postgres-live.integration.test.ts`
- `packages/microfinance/src/community-tontine-mf-settlement-repository.ts`

## Corrections
1. **S-03.4 tontine contribution fixture**
   - The live test previously generated arbitrary group and membership UUIDs without inserting the referenced rows.
   - It now creates a real active tontine group and membership in the test organization.
   - Both initial and rollback contribution fixtures reference those persisted rows.
   - Cleanup removes contributions before memberships and groups.
   - Composite tenant/group foreign keys remain unchanged and fully enforced.

2. **Community Tontine partner settlement parameter typing**
   - `payout_intents.currency` is `text`, while the settlement instruction currency is `char(3)`.
   - The same untyped PostgreSQL placeholder was used in both contexts, allowing conflicting parameter type inference.
   - The settlement SQL now explicitly casts the placeholder to `text` at selection and comparison boundaries.
   - A repository SQL regression assertion locks this behavior.
   - No financial amount, approval, maker-checker, payout, or ledger invariant changes.

3. **P056 cross-tenant enrollment test**
   - The test attempted the cross-tenant foreign-key case using a class already at capacity, so the capacity guard correctly rejected first.
   - It now creates a separate active class with spare capacity before attempting the foreign-tenant student enrollment.
   - This makes the intended composite foreign-key boundary observable without weakening or bypassing the capacity guard.

## Security and finance invariants preserved
- No test skipped, no RLS/foreign-key/unique constraint removed.
- No class capacity guard weakened.
- Community Tontine remains an operational partner workflow; Financial Core remains the only authority for posted money.
- Tenant and organization scoping remains enforced by PostgreSQL constraints.

## Validation status
- Source changes committed to `fix/issue-162-postgres-live-regressions`.
- Targeted PostgreSQL 17 tests and full CI are **pending**; no passing result is claimed in this record.
- PR #163 is open and marked ready for review (not draft). Its validation remains blocked: the exact head SHA has not completed any test step.
- Required gates remain targeted PostgreSQL 17 regressions, full `npm run test:postgres`, `npm run check`, `npm run security:fortress`, Web build and Android build.
- No merge, production certification or release approval is implied.

## Next gate
Run the full PostgreSQL 17 suite on the PR head, inspect any new failure at its root cause, then run the complete required CI matrix on one exact SHA. Only after those gates pass may P057.1/P057.2 be approved for merge and P057.3 implementation begin.


## CI runner diagnosis — 2026-11-06
- The latest CI run for the PR head `fcfef5616cf1ae370d41bce20c6e45855f84d254` is run `42228061366` (quality); the Android run is `42228061357`.
- GitHub job records report `runner_id: 0`, empty `runner_name`, and `steps: null` for both jobs; the jobs expose no step execution or log URL.
- This is consistent with failure before a runner starts. It does **not** establish a source-code test failure and does not prove the code is correct.
- Both workflows declare `runs-on: ubuntu-latest`; no custom self-hosted runner is configured in these workflow files.
- The next diagnostic is administrative: verify that GitHub Actions is enabled for this private repository, that GitHub-hosted runners are permitted for the repository/owner, and that any applicable usage/billing/policy restrictions allow jobs to start. Re-run the exact SHA only after runner allocation is restored.
- Do not change application code or weaken CI gates to disguise an infrastructure-level runner allocation failure.
