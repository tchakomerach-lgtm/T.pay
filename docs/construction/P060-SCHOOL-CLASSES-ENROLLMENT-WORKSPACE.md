# P060 — School OS classes and enrollment read workspace

## Brick
P060 / School OS — class catalog, active enrollment history and responsive workspace.

## Repository references consulted
- `AGENTS.md`
- `docs/skills/TPAY-CONSTRUCTION-001.md`
- `docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md`
- `docs/bibles/IMPLEMENTATION-MAP.md`
- `docs/bibles/TPAY-DESIGN-BIBLE-IMPLEMENTATION.md`
- `docs/bibles/DB-072-DESIGN-IMPLEMENTATION-QUALITY-GATES.md`
- `docs/skills/TPAY-SEC-001.md`
- `docs/security/THREAT-MODEL.md`
- Existing implementation: `packages/education/src/education-http.ts`, `packages/education/src/school-operations.ts`, `packages/education/src/postgres-sync-fabric.ts`, `apps/experience-web/src/api.ts`, `mobile/tpay_flutter/lib/api/tpay_api_client.dart`
- Existing migrations: `044_p038_education_sync_fabric.sql`, `045_p039_education_api.sql`, `099_education_realtime.sql`

## Discover / current-code findings
- The Education domain already persisted actors and student lifecycle, but did not have a durable class catalog or enrollment history.
- Existing API routes did not expose organization-scoped class or student list reads.
- The shared Experience OS already provided a React HTTPS client and the Flutter renderer already provided an HTTPS API client.
- School OS had an older command-center shell, but not a class/enrollment workspace.

## Design decision
- Add migration 115 with `education_classes` and `education_enrollments`.
- Keep enrollment history durable and preserve a single active enrollment per student per academic year using a partial unique index.
- Use composite tenant/organization foreign keys so an enrollment cannot link a student or class from another organization.
- Force RLS on both new tables. Read policies and insert policies require transaction-local `tpay.tenant_id` and `tpay.organization_id` context.
- Expose only GET routes in this brick: `/v1/education/classes` and `/v1/education/students`.
- Execute reads in a dedicated read-only PostgreSQL transaction, set local tenant context, use explicit tenant + organization predicates, and release the connection on every path.
- Bound class results to 200 and student results to 100. Academic year and page size are validated before querying.
- Student roster resolves only the most recent active enrollment, avoiding duplicate roster rows across historical years.
- Record read access through the existing API audit repository.
- React displays actual API data only when a valid runtime session exists. Flutter accepts an authenticated API client through dependency injection; the default app does not fabricate records.
- No class create/update, student mutation, enrollment/transfer command, grades, attendance or school-fee workflow is exposed by this brick.

## Threat gate
- Cross-tenant read: mitigated by forced RLS, transaction-local tenant context and explicit SQL predicates.
- Cross-organization relation: mitigated by composite foreign keys and scoped queries.
- Privilege escalation: server-side `org.read` authorization is required; routes are GET-only in the API allowlist.
- Replay/double execution: no mutating API command is introduced.
- Sensitive data exposure: response contains student identifier, lifecycle, display name and active class only; read access is audited.
- Failure state: invalid session, missing permission, malformed filters or database failure return an error; no fallback fixture data is rendered.
- Offline state: no local optimistic student/class mutation is permitted.

## Tests added
- `tests/education-school-workspace.test.ts`: class/student routes, query binding, validation, audit and authorization.
- `tests/education-school-schema.test.ts`: schema, composite FKs, active-enrollment uniqueness and RLS contract.
- `tests/education-school-postgres.live.ts`: real PostgreSQL cross-tenant RLS test, included in `npm run test:postgres`.
- Flutter widget coverage for School OS empty state without a secure session.

## UI delivery
- React School OS workspace: 3D hero, class cards, operational metrics, roster table, search, class filter, loading/error/empty states and freshness timestamp.
- Flutter School OS workspace: 3D brand surface, metrics, class and roster panels, loading/error states and optional authenticated API-client injection.
- Reduced-motion rules disable decorative movement without removing state information.
- Financial actions and student mutations remain outside the UI.

## Rollback / compatibility
- Migration rollback: drop `education_enrollments`, then `education_classes`, then remove the added unique constraint from `education_students`.
- No existing rows are rewritten by migration 115.
- Existing API routes and clients remain backward compatible.
- No data migration or external provider contract is required.

## Acceptance gate
- TypeScript strict typecheck and production build.
- Unit tests and School OS API authorization tests.
- Design-contract parity and React production build.
- Flutter analyze, widget tests and Android APK build.
- Live PostgreSQL migration and tenant-isolation test.
- Security Fortress and full CI on the exact PR HEAD.

## Remaining risks / next brick
- API read paths are implemented; class creation, updates, enrollment, transfer and withdrawal require separately authorized transactional commands, outbox/audit atomicity, concurrency/capacity constraints and dedicated integration tests.
- Existing student/actor tables have their own historical RLS/grant posture and must be hardened before exposing broader personal/guardian fields.
- Flutter API client injection is ready, but the production authentication/session provider and secure token storage are not yet connected to the app shell.
- School grades, subjects, coefficients, periods, validations, report cards and parent access remain future vertical bricks.
- This brick is not a production certification; only green exact-HEAD CI and terrain evidence can establish release readiness.
