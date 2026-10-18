# MF-FIELD-REGISTRY-001 — Client Field Registry & Collection Handover

## Outcome
A customer's collection location and service route are institution-owned records. Reassignment proposals can be reconstructed when an agent is unavailable; customer accounts and posted financial history never belong to the agent.

## Bible map consulted
- `AGENTS.md`
- `docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md`
- `docs/skills/TPAY-CONSTRUCTION-001.md`
- `docs/skills/TPAY-MF-002.md`
- `docs/skills/TPAY-SEC-001.md`
- `docs/skills/TPAY-FIN-002.md`
- `docs/security/THREAT-MODEL.md`
- `docs/architecture/ADR-004-community-tontine.md`
- Existing `packages/microfinance/src/field-agent.ts`

## Implemented in this brick
- Strict geographic coordinate and GPS-accuracy validation.
- Location consent and address/landmark evidence requirements.
- Findability score that reflects evidence and never invents GPS precision.
- Haversine distance calculation with invalid-coordinate rejection.
- Deterministic continuity planning scoped by organization.
- Candidate filtering by authorization, heartbeat freshness, availability, capacity and route radius.
- Workload-aware assignment planning.
- Stable SHA-256 plan binding includes location capture and workload inputs; it is not a digital signature or authorization token.
- Correct distinction between a primary agent who is unavailable and one who is healthy but at capacity.
- Database-level verification evidence constraints and idempotent route foreign-key creation.
- Additive PostgreSQL schema for field profiles, location history, routes, assignments, visit events, handover cases and handover items.
- Targeted unit tests for consent, precision, invalid coordinates, tenant isolation, stale/unauthorized agents, capacity, determinism and approval boundary.

## Security and financial boundaries
- GPS is operational evidence, never customer identity proof or payment authorization.
- The module does not collect or post money and does not mutate the Ledger.
- Reassignment is a proposal, not an automatic authority grant.
- Applying a handover must be a separate server-side command with supervisor authorization, current-version checks, idempotency and append-only audit.
- Exact customer coordinates and landmarks must be returned only to staff with a valid organization-scoped assignment.
- Location capture requires the applicable notice/consent and a retention policy.
- The database migration must be reviewed against actual organization/customer identifiers before production application.

## Validation status
The initial Android job failed without a runner ID or step logs. A retry was requested; inspect its result and the CI run for the new exact head. The code changes in this revision are not validated until TypeScript tests, security checks and PostgreSQL migration integration run successfully. This brick is not production-certified until exact-head CI, migration integration, authorization/API wiring and the supervised handover E2E are green.

## Next implementation slice
1. Add repository methods with organization-scoped reads and compare-and-set on profile/assignment versions.
2. Add authenticated API endpoints for location capture, route query, handover proposal, approval and application.
3. Bind server-side role/permission checks and location field-level authorization.
4. Add PostgreSQL integration tests for concurrent handover approvals, expired plan, replay and cross-tenant reads.
5. Add map UI and offline visit capture without allowing offline Ledger mutation.
