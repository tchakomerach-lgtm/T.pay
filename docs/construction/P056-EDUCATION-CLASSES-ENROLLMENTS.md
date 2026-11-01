# P056 — School classes and enrollment API

## Scope
- Additive PostgreSQL schema for tenant/organization-scoped classes and enrollment lifecycle.
- Authenticated API Gateway routes:
  - `GET /v1/education/classes`
  - `POST /v1/education/classes`
  - `GET /v1/education/enrollments`
  - `POST /v1/education/enrollments`
- Read operations require `org.read`; create operations require `org.manage`.
- Mutating requests require the existing API Gateway idempotency key and append-only request audit.
- Client-supplied financial fields are rejected. No school fee, balance, payment, wallet, commission or ledger data is accepted or persisted.

## PostgreSQL controls
- Migration: `115_education_classes_enrollments.sql`.
- Composite scope foreign keys bind class creator, enrolled student and enrollment creator to the same tenant and organization.
- Class identity is unique per organization and academic year.
- One ACTIVE enrollment per student/organization/academic year is enforced by a partial unique index.
- Class capacity is maintained by an atomic database counter update in a row trigger. Concurrent enrollment attempts serialize on the class row; the database rejects admissions beyond capacity.
- Enrollment class/year references are protected by a composite foreign key.
- RLS is enabled consistently with existing Education persistence. Runtime authorization and tenant predicates remain mandatory.

## Verification added
- HTTP tests cover authenticated class creation, finance-field rejection, read/write permission separation and idempotency integration.
- Live PostgreSQL test applies migrations twice, checks class capacity, duplicate active enrollment rejection and concurrent capacity admission (two independent database connections).
- CI must run the repository's existing Node 22 + PostgreSQL 17 pipeline on the exact PR head.

## Rollback and recovery
- Migration is additive. Do not drop classes/enrollments or reset counters during rollback if any school data has been written.
- Application rollback: revert the API commit while retaining the additive tables and constraints.
- Schema rollback requires a separately reviewed archival/export and explicit data-loss approval. Prefer a forward corrective migration.
- Failed migration or legacy-data constraint violation blocks deployment; do not bypass or mark the migration as applied.

## Status at record creation
- Implementation committed to `feat/education-classes-enrollments-api-001`.
- Local PostgreSQL execution has not been performed in this session.
- GitHub Actions exact-head CI and live PostgreSQL integration results remain required before this brick can be called validated.
- PR must remain draft until every required check is green and reviewed.

## CI incident and correction
- First PR run stopped during job initialization because repository policy requires full-length immutable SHA references for every GitHub Action; no application or PostgreSQL step had started.
- Corrected `.github/workflows/ci.yml`, `.github/workflows/android.yml` and `.github/workflows/terrain-certification.yml` to use full commit SHAs. The next run successfully initialized the jobs and began PostgreSQL service setup and Android build.
- The migration source was subsequently rechecked for exact file length and single definitions of both tables and the capacity trigger after a file-editing issue; the clean 150-line migration is now committed. Only the latest exact-head CI result can validate it.
