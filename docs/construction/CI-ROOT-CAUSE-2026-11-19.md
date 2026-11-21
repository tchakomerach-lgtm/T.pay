# CI root-cause correction — 2026-11-19

## Scope
PR #197, branch `fix/ci-pin-actions-main-2026-11`. This record documents the PostgreSQL test-ordering defect exposed after full-SHA action pinning.

## Evidence
- Initial affected workflow: run `44250283569`, job `134618995761`, commit `7614e6a8914e28cca4bc7c9775074bd0fa0fb2f6`.
- The Actions setup, checkout, Node setup and dependency installation completed.
- `npm run check` invokes `npm test`, which loads every `dist/tests/*.test.js` file.
- Several PostgreSQL-backed test files activate when `TPAY_DATABASE_URL` exists. They include the School sync, operational recovery/observability, API rate-control, commercial persistence, and independent tontine live suites.
- CI previously exposed `TPAY_DATABASE_URL` at job scope, but applied migrations only in the later `npm run test:postgres` step.
- PostgreSQL-backed tests therefore attempted to use relations before the migration chain had created them. The log records errors including `relation "fortress_vaults" does not exist` and `relation "education_realtime_events" does not exist`.
- The next attempt confirmed that gating only `postgres-live.integration.test.ts` was insufficient: other live PostgreSQL tests still ran in `npm run check`.

## Root cause
The database URL was visible to the entire CI job, so any test that used its presence as an integration-test switch ran before migrations. The first fix isolated only one test file and did not account for the other PostgreSQL-backed test files.

## Correction
1. `TPAY_DATABASE_URL` is now scoped only to the dedicated PostgreSQL CI step, not the whole job. The ordinary `npm run check` therefore runs without a live database connection.
2. `npm run test:postgres` builds the project and applies the full migration chain before launching the PostgreSQL-enabled suite.
3. The runner executes the full compiled test suite with `TPAY_RUN_POSTGRES_LIVE=1` and `--test-concurrency=1`. This keeps every database-backed test in the migrated phase and serializes tests that independently invoke the migration runner.
4. The explicit opt-in remains on `postgres-live.integration.test.ts`; all other database-backed tests still activate only when the PostgreSQL URL is supplied.
5. No test is deleted, weakened, or hidden.

## Required verification
- `npm run check`: TypeScript + unit/invariant suite with no PostgreSQL URL.
- `npm run test:postgres`: full migrations, then the complete compiled test suite with PostgreSQL enabled and serialized.
- Security fortress, Web builds, dependency audit and Android build must pass on the exact PR HEAD.
- Flutter analyze/tests/APK require the separate Flutter workflow on the exact SHA.
- Terrain certification requires the configured self-hosted `tpay-terrain` runner and real-device evidence.

## Status
The CI ordering and test-runner correction is committed to the PR branch. Validation is pending on the resulting exact HEAD. No merge, deployment or production-readiness claim is made.
