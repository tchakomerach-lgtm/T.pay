# TPAY-SUPER-ADMIN-001 — Super Admin Control Plane

## Scope
Executable baseline for the Super Admin Bible: privileged identity assurance, short-lived JIT grants, root-operation quorum, request-digest binding, recovery state machine and financial reopening gates.

## Mandatory invariants
- Production is not a recovery authority.
- Root operations require quorum and independent security domains.
- Privileged access is short-lived and explicitly justified.
- One-shot grants expire after use.
- Recovery progresses through an explicit state machine; no direct UNKNOWN -> TRUSTED transition.
- Financial reopening is fail-closed until infrastructure, identity, keys, ledger, reconciliation, security validation and quorum are all satisfied.
- Cryptographic request digests bind approvals/actions to the exact request.
- Database schema stores control metadata only; private keys/secrets never belong in these tables.

## Bible mapping
- Prompt 003: Root of Trust and quorum.
- Prompt 004: privileged identity lifecycle and assurance.
- Prompt 005: JIT/PAM session boundaries.
- Prompt 007: threat-hunting dependency before/after recovery.
- Prompt 008: clean-room recovery, financial reopening and recovery state machine.

## Not yet production-ready
This brick is a durable control-plane foundation, not the complete Super Admin implementation. Remaining gates include concrete PAM/session brokering, hardware-backed key integration, PostgreSQL concurrency tests for the new tables, Recovery Orchestrator integration, independent recovery environment, immutable backup validation, full audit/provenance integration, live CI evidence and red-team exercises.
