# CI root-cause correction — 2026-11-19

## Scope
PR #197, branch `fix/ci-pin-actions-main-2026-11`. This record documents the second CI blocker exposed after full-SHA action pinning.

## Evidence
- Workflow run: `44250283569`, job `134618995761`, commit `7614e6a8914e28cca4bc7c9775074bd0fa0fb2f6`.
- The Actions setup, checkout, Node setup and dependency installation completed.
- `npm run check` invokes `npm test`, which previously globbed every `dist/tests/*.test.js` file.
- `tests/postgres-live.integration.test.ts` previously activated whenever `TPAY_DATABASE_URL` existed.
- CI provides `TPAY_DATABASE_URL` to the whole job, but the workflow applies migrations only in the later `npm run test:postgres` step.
- The unit/invariant phase therefore launched PostgreSQL integration cases before the schema existed. The log records PostgreSQL errors such as `relation "fortress_vaults" does not exist` and `relation "education_realtime_events" does not exist`.
- The job ultimately ended with `The operation was canceled` at the 35-minute job timeout. This was not a passing run.

## Root cause
The test boundary was inferred from database URL presence instead of an explicit request to execute live integration tests. This made the unit test command depend on database migration ordering and caused the same integration suite to run in the wrong CI phase.

## Correction
1. Unit/invariant runs skip the live PostgreSQL suite unless `TPAY_RUN_POSTGRES_LIVE=1` is explicitly set.
2. The dedicated `test:postgres` command continues to build, apply the full migration chain, then invoke a small Node runner that explicitly enables the live suite.
3. The runner uses `process.execPath` and inherited environment, avoiding platform-specific shell environment assignment.
4. No test is deleted, weakened, or hidden; PostgreSQL integration remains a required separate CI gate.

## Required verification
- `npm run check`: typecheck + unit/invariant suite, with PostgreSQL live tests intentionally skipped.
- `npm run test:postgres`: full migration chain followed by the complete PostgreSQL live integration suite.
- Security fortress, Web builds, dependency audit, Android build and the separate Flutter analyze/test/APK workflow must pass on the exact release SHA.
- Terrain certification still requires the configured self-hosted `tpay-terrain` runner and real-device evidence.

## Status
Code change committed to the PR branch. Validation is pending on the resulting exact HEAD. No merge, deployment or production-readiness claim is made.
