# P056 — School classes and enrollment API

## Scope
- Additive PostgreSQL schema for tenant/organization-scoped classes and enrollment lifecycle.
- Authenticated API Gateway routes:
  - `GET /v1/education/classes`
  - `POST /v1/education/classes`
  - `GET /v1/education/enrollments`
  - `POST /v1/education/enrollments`
  - `PATCH /v1/education/enrollments/:enrollmentId` (transition ACTIVE → WITHDRAWN/CANCELLED/COMPLETED, with mandatory expectedVersion)
- Read operations require `org.read`; create and lifecycle transitions require `org.manage`.
- Lifecycle transitions use a single conditional PostgreSQL UPDATE scoped by tenant, organization, enrollment ID, ACTIVE state and expected version. The database trigger decrements the class counter in the same statement transaction; stale versions/state return HTTP 409 and cross-scope missing resources return HTTP 404. Terminal states cannot be reopened through this API.
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
- Live PostgreSQL test applies migrations twice, checks class capacity, duplicate active enrollment rejection, cross-tenant composite-FK rejection, concurrent capacity admission (two independent database connections), and counter decrement on withdrawal/terminal transition.
- HTTP tests cover the version-guarded lifecycle endpoint, organization permission denial, invalid transitions and rejection of financial fields.
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


## P056 lifecycle API extension — 2026-11-01
- Added `PATCH /v1/education/enrollments/:enrollmentId` for controlled terminal transitions.
- Required optimistic concurrency token: `expectedVersion`.
- The SQL update is tenant/organization scoped and only matches ACTIVE records at the expected version; the existing database trigger atomically updates the class counter.
- The API intentionally does not expose reactivation or class transfer. Those require separate reviewed state transitions and audit semantics.
- Added live PostgreSQL assertions for cross-tenant student reference rejection and enrollment counter decrement after withdrawal.
- Validation remains pending until CI executes against the resulting exact head and the live PostgreSQL job completes successfully.
