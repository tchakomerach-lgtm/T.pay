# CI-TYPECHECK-BASELINE-002 — strict TypeScript failures uncovered after runner unblocked

## Detection
After full-SHA pinning allowed the quality job to start, `npm run check` exposed existing strict TypeScript errors in education HTTP header parsing, community-tontine microfinance settlement flows, settlement row mapping, vault audit optional fields, and regression tests.

These failures had been hidden behind the previous runner-policy failure. They are not attributed to the Tontine callback patch.

## Corrections
- Guarded the optional first Content-Type token before calling string methods.
- Removed an explicit `approvedBy: undefined` assignment under `exactOptionalPropertyTypes`; preparation now omits the approval field.
- Narrowed PostgreSQL RETURNING row access after explicit row-count checks.
- Constructed vault audit events with optional fields only when present.
- Added non-null assertions only to test fixtures whose array cardinality is asserted by the test setup; guarded the typed-array mutation byte.

## Scope
No business rule, permission, financial state machine, SQL constraint, or CI check was weakened. No financial amounts or ledger logic were changed.

## Validation
The initial pinned workflow reached TypeScript and failed on these pre-existing errors. The corrections are now committed. A new CI run for the latest SHA is required; do not mark the baseline green until that exact run completes, followed by PostgreSQL integration, security fortress, Web build, dependency audit and Android build.
