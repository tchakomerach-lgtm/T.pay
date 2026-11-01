# P057 — School Classes and Enrollment Web Workspace

## Objective
Connect the P056 authenticated class/enrollment API to the existing School OS web application. This brick implements the operational UI for class creation, class listing, student enrollment and enrollment listing.

## Bible and skill map consulted
- `AGENTS.md`
- `docs/bibles/IMPLEMENTATION-MAP.md`
- `docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md`
- `docs/bibles/TPAY-DESIGN-BIBLE-IMPLEMENTATION.md`
- `docs/bibles/DB-071-TEMPORAL-PERMISSIONS-RESERVATION-LANGUAGE-GOVERNANCE.md`
- `docs/bibles/DB-072-DESIGN-IMPLEMENTATION-QUALITY-GATES.md`
- `docs/skills/TPAY-CONSTRUCTION-001.md`
- `docs/skills/TPAY-AUTH-002.md`
- `docs/skills/TPAY-SEC-001.md`
- `docs/skills/TPAY-FIN-002.md`

The repository's Bible consultation registry does not currently list a standalone education Bible file; education requirements are distributed across the implementation map, education domain code, P038/P039/P040 records and the cross-domain security/design rules. Do not invent an alternate school policy document.

## Implementation
- Added typed client operations for `GET/POST /v1/education/classes`, `GET/POST /v1/education/enrollments` and version-guarded `PATCH /v1/education/enrollments/:enrollmentId`.
- Added an explicit confirmation action to withdraw an active enrollment. The UI sends the server-issued enrollment version and refreshes authoritative class/enrollment data after success.
- Added authenticated class and enrollment screens, including school-year filter, class capacity display, enrollment status and refresh.
- Mutations use fresh idempotency keys and only send school-domain fields.
- Server authorization remains authoritative. Permission denials and API errors are shown as errors; the UI never reports a mutation as successful before the API confirms it.
- Demo mode is explicitly non-persistent and disables all mutations.
- Session bootstrap now requires the actual session expiry supplied by the operator; the browser no longer fabricates a 24-hour session lifetime.
- HTTPS-only requests and redirect rejection remain enforced by the web client.
- Added client tests for authenticated reads, idempotent writes, finance-field exclusion, permission-denial handling and versioned enrollment withdrawal.

## Finance boundary
The education UI does not collect or submit school fees, balances, wallet identifiers, payment references, commission values or ledger instructions. Any future school receivable/payment workflow must use the Finance Core contracts and never be implemented as an education-side write.

## Design/accessibility
- French is the default UI language.
- Responsive layout, keyboard focus indicators, semantic form labels, live status/error announcements and reduced-motion support are included.
- No status depends on color alone.
- Live event messages trigger a server refresh; the event stream remains the source of change notifications, not a substitute for authoritative API reads.

## Verification status
- Automated web-client tests added in `tests/education-web.test.ts`.
- Full TypeScript, API, PostgreSQL, security and Web build checks are required on the exact PR head.
- Real-browser responsive, keyboard/screen-reader, reconnect and low-bandwidth checks remain required before field certification.
- PostgreSQL live migration/concurrency validation is tracked in parent P056 PR #155 and is not claimed complete by P057.

## Known limitations / next gates
- No offline mutation queue is enabled for class or enrollment writes. Offline is read-only/degraded until a separate signed evidence/sync workflow is implemented and validated.
- No student search/selection UI yet; enrollment currently accepts a server-recognized student ID. Add a tenant-scoped student picker after the student API contract is verified.
- No class edit/archive, enrollment transfer/reactivation, guardian assignment, gradebook, bulletin or document generation is added here. Enrollment withdrawal is implemented through the guarded P056 lifecycle API.
- No production deployment or school field certification is claimed.

## Parent / integration
Parent API branch: `feat/education-classes-enrollments-api-001` (PR #155).
This PR targets the parent branch so API and UI can be reviewed and validated as one coherent stack before integration to `main`.



## P056 lifecycle integration — 2026-11-01
- Added client-side `transitionEnrollment` using HTTPS-only `PATCH`, a fresh idempotency key and mandatory `expectedVersion`.
- Active enrollment rows expose an explicit, confirmation-protected withdrawal action. The button is disabled in demo mode and while another operation is running.
- On success, the UI reloads classes and enrollments from the authoritative API; it does not locally decrement capacity or claim success before the API responds.
- P056 API Gateway route policy must include `PATCH /v1/education/enrollments/:enrollmentId`; this was added to the parent branch and will be exercised by parent/child CI.


## Parent synchronization
- Parent P056 branch synchronized to `ed8464b92f818bacd5d8db568966da67b6d3b601` after the lifecycle API, API Gateway allowlist and dependent-PR CI trigger updates.
- P057 remains based on the P056 branch; exact-head CI must therefore validate the merged parent + UI snapshot, not the UI branch in isolation.

- The parent now emits `class.changed` and `enrollment.changed` events. P057 refreshes the authorized list views after receiving these events; event payloads are not treated as authoritative records.
