# Community Tontine — governance API and renderer 005

## Implemented

The authenticated Education API now exposes the following independent Community Tontine governance operations:

- `GET /v1/tontine/groups/:groupId/governance/policy`: returns the explicitly configured policy, or null when no policy exists.
- `PUT /v1/tontine/groups/:groupId/governance/policy`: creates policy version 1 or increments the version exactly once; requires organization management permission and an idempotency key.
- `POST /v1/tontine/groups/:groupId/governance/proposals`: opens a member-vote proposal only when the group is configured for member voting, the proposer is an active member, a policy exists, and at least two active members are present. It snapshots quorum, approval threshold, abstention policy, eligible-member count and policy version.
- `POST /v1/tontine/groups/:groupId/governance/proposals/:proposalId/votes`: records one vote per active member while the proposal window is open. Abstention is accepted only when enabled in the immutable snapshot.
- `POST /v1/tontine/groups/:groupId/governance/proposals/:proposalId`: finalizes only after the proposal close time. It calculates quorum and approval from the captured snapshot and records approved, rejected or expired.

All mutation commands use a tenant-scoped PostgreSQL transaction, idempotency reservation, audit hash and transactional Outbox event. Proposal rows are locked before vote/finalization commands. Database constraints protect organization scope, one vote per member, immutable proposal content and policy snapshots.

## Web and Flutter

- React Experience Web exposes policy configuration, proposal creation, vote actions and finalization actions in the 3D Community Tontine workspace.
- Flutter API client supports HTTPS PUT in addition to GET/POST/PATCH.
- Flutter Community Tontine exposes policy configuration, proposal creation, voting and post-window finalization actions.
- UI actions call the authenticated API; they do not mutate balances or simulate settlement.

## Explicit remaining gates

- Run the exact current HEAD CI and inspect all test/build outputs.
- Run PostgreSQL live tests against the full migration chain, including concurrent vote attempts, duplicate idempotency keys, duplicate member votes, cross-tenant access, policy version races and finalization races.
- Add a durable scheduled finalization worker and retry/lease semantics; currently finalization is an explicit authenticated command after the close time.
- Validate group-specific authorization for policy administration and finalization against the final T.Pay role matrix.
- Add integration tests for the complete governance lifecycle on Web and Flutter.
- No financial payout is authorized by a governance decision. Approved actions must be translated into separately authorized domain commands; all money movement remains inside Financial Core.

A green TypeScript/unit CI is not a substitute for the PostgreSQL concurrency and field-certification gates above.
