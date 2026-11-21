# CI correction — migration entrypoint compilation — 2026-11-19

## Evidence
On PR #197 HEAD `9568ba65190cda4c1ef1a8eab3893720a0c3feac`:
- TypeScript/unit/invariant step passed: 318 passed, 26 skipped (the expected PostgreSQL-gated tests).
- Android debug APK workflow passed.
- PostgreSQL integration step failed before opening the database with `Cannot find module dist/scripts/migrate.js`.

## Root cause
`tsconfig.json` included application, package and test TypeScript but omitted `scripts/**/*.ts`. The npm script `db:migrate` expected the compiled `dist/scripts/migrate.js`, so the migration entrypoint was never emitted.

## Fix
Include `scripts/**/*.ts` in the TypeScript project. This compiles migration and local bootstrap entrypoints under the same strict compiler settings as the rest of the repository. The migration command and test suite are unchanged.

## Verification required
- Strict TypeScript check and unit/invariant suite.
- Full PostgreSQL migration chain and live integration suite.
- Security fortress, Web build, investor build and production dependency audit.
- Android and Flutter checks on the exact final SHA.

No tests were removed or weakened. No merge or production certification is authorized by this correction.
