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
- PR #163 is open and not a draft. Its validation remains blocked: the exact head SHA has not completed any test step.
- Required gates remain targeted PostgreSQL 17 regressions, full `npm run test:postgres`, `npm run check`, `npm run security:fortress`, Web build and Android build.
- No merge, production certification or release approval is implied.

## Next gate
Run the full PostgreSQL 17 suite on the PR head, inspect any new failure at its root cause, then run the complete required CI matrix on one exact SHA. Only after those gates pass may P057.1/P057.2 be approved for merge and P057.3 implementation begin.

## CI runner diagnosis — 2026-11-06 (updated 20:36 UTC)

### PR #163 — current head
- Current PR #163 head at the time of this record: `872be3c16df9c5a85496b29f524e5a391ddd1879`.
- Latest push runs: Quality `42235898905` and Android `42235898973`; both completed with failure on attempt 2.
- Their jobs (`127955481082` and `127955503296`) return `steps: null` and `logs_url: null`. No test command started.

### Distinguishing earlier test failures from the runner-allocation failure
- Earlier Android run `42189284459` successfully executed all steps, including `gradle :app:assembleDebug`.
- Earlier Quality run `42189284722` successfully started a runner, completed checkout, dependency installation, build, migrations and least-privilege runtime provisioning, then failed at `npm run test:postgres` (step 9).
- Therefore the earlier PostgreSQL failure is a real test-suite failure; the later `runner_id: 0` / null-step jobs are a separate pre-execution infrastructure or usage-policy failure.

### Workflow trigger correction
- Both workflows previously restricted `pull_request.branches` to `main` and `feat/education-classes-enrollments-api-001`, excluding the stacked PR base branch `feat/p057-2-runtime-session-rls`.
- The filters were removed on that base branch so pull-request validation now applies to all target branches.
- CI workflow commit: `faa911760bf11908bf8e956f8c3a5fe5fd6340f1`.
- Android workflow commit: `79f8ee80cdb56e84d525f2b556075c637fdee084`.
- The corrected workflow generated pull-request runs for PR #161: Quality `42289470408` and Android `42289470418`. Both still failed before the first step, with null steps/logs. The trigger-filter defect is corrected; runner provisioning is not.

### Remaining administrative diagnosis
- GitHub-hosted standard runners for private repositories consume the repository owner's included compute usage and may incur charges after the included allowance is consumed.
- Earlier successful runner allocations followed by later pre-step failures make a usage/quota/budget restriction plausible, but the repository connector cannot inspect the owner's private billing dashboard or prove that quota exhaustion is the root cause.
- Repository owner must verify included compute remaining, spending limit, payment status and Actions policy in GitHub Billing and repository Settings.
- Do not switch to `self-hosted` until a real runner is registered and online. Do not change runner labels or disable checks to disguise the allocation failure.

### Release gate
No test is considered successful on the blocked SHA. No merge, production certification or P057.3 implementation is authorized until the runner issue is resolved and the full required CI matrix passes on one exact SHA.
