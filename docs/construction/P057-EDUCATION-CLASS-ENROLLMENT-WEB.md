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
- Added typed client operations for `GET/POST /v1/education/classes` and `GET/POST /v1/education/enrollments`.
- Added authenticated class and enrollment screens, including school-year filter, class capacity display, enrollment status and refresh.
- Mutations use fresh idempotency keys and only send school-domain fields.
- Server authorization remains authoritative. Permission denials and API errors are shown as errors; the UI never reports a mutation as successful before the API confirms it.
- Demo mode is explicitly non-persistent and disables all mutations.
- Session bootstrap now requires the actual session expiry supplied by the operator; the browser no longer fabricates a 24-hour session lifetime.
- HTTPS-only requests and redirect rejection remain enforced by the web client.
- Added client tests for authenticated reads, idempotent writes, finance-field exclusion and permission-denial handling.

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
- No class edit/archive, enrollment transfer/withdrawal, guardian assignment, gradebook, bulletin or document generation is added here.
- No production deployment or school field certification is claimed.

## Parent / integration
Parent API branch: `feat/education-classes-enrollments-api-001` (PR #155).
This PR targets the parent branch so API and UI can be reviewed and validated as one coherent stack before integration to `main`.

