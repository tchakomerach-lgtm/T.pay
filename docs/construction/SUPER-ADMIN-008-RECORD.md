# Super Admin Bible — Construction Record 008

## Source
Prompt 003 Root of Trust + Prompt 004 Admin Lifecycle + Prompt 005 PIM/PAM + Prompt 007 Threat Intelligence/Threat Hunting + Prompt 008 Cyber Resilience/Disaster Recovery.

## Implemented in this brick
- `packages/security/src/super-admin-control.ts`
- `tests/super-admin-control.test.ts`
- `migrations/045_super_admin_control_plane.sql`
- `docs/skills/TPAY-SUPER-ADMIN-001.md`

## Concrete controls
1. Privileged identity assurance and expiry.
2. Maximum 15-minute JIT grants.
3. Justification required for privileged grants.
4. One-shot grants expire on consumption.
5. Root operations require three distinct actors and three independent domains.
6. Root operations are bound to a SHA-256 request digest.
7. Recovery uses an explicit monotonic state machine.
8. Financial reopening fails closed unless all critical trust/reconciliation gates pass.
9. Recovery metadata is durable; secrets and private keys are excluded.
10. Direct production recovery is forbidden by the domain contract.

## Verification state
- TypeScript unit tests added.
- Migration added.
- Exact-head CI still required.
- PostgreSQL live concurrency tests for the new schema still required.
- No production-ready claim.

## Next implementation gate
Integrate this control plane with the existing authoritative session, replay, approval and audit boundaries; then build the independent Recovery Orchestrator/PAM session broker and execute PostgreSQL concurrency + adversarial tests.
