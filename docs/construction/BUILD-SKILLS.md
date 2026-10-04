# T.Pay Engineering Skills Registry

These skills are mandatory operating capabilities for the construction agent and human maintainers.

## SKILL-01 — Exact-Head Verification
Before declaring a layer green, resolve the branch head SHA and verify CI for that exact SHA. Never substitute a parent or merge-base result.

## SKILL-02 — Database-Invariant Engineering
For every durable state transition, define PostgreSQL constraints, tenant-safe foreign keys, uniqueness/idempotency rules, and a live integration test.

## SKILL-03 — Concurrency Proof
For payout, reversal, approval, session, collection, recovery, outbox and device-sequence operations, run two-worker PostgreSQL race tests and assert the exact winner/loser invariant.

## SKILL-04 — Financial-Core Boundary
Trace every money-changing path to the Financial Core/Ledger. Reject direct Ledger mutation from AI, provider callbacks, offline clients and UI adapters.

## SKILL-05 — Provider Contract Isolation
Treat TMoney, Flooz, PI-SPI and partner-MFI integrations as replaceable adapters. Contract tests must cover signatures, replay, amount/currency/reference mismatches, timeout and delayed confirmation.

## SKILL-06 — AI Tool Governance
Every AI tool has organization scope, risk classification, allowlist, bounded payloads, idempotency, audit trail and human approval for high-impact actions.

## SKILL-07 — AI Security
Continuously test prompt injection, tool-result poisoning, data exfiltration, privilege escalation, indirect prompt injection and model-routing mistakes. Security failures quarantine the action.

## SKILL-08 — Offline/Africa Resilience
Design for intermittent networks, low bandwidth, cash-first collection, mobile money, USSD/SMS/voice, field agents, shared devices, delayed synchronization and explicit conflict resolution.

## SKILL-09 — Observability
Every critical workflow exposes correlation IDs, tenant IDs, state transitions, latency, retry counts, provider status, reconciliation exceptions and security events without leaking secrets.

## SKILL-10 — Safe Dependency Failure
External calls use bounded timeouts, bounded retries, circuit breakers and idempotency. Provider outage must never corrupt or invent financial truth.

## SKILL-11 — Regulatory Boundary
Separate software readiness from legal authorization, licensing, partner certification and production credentials. Keep regulated capabilities partner-led until their activation gates are satisfied.

## SKILL-12 — Durable Handoff
Each sequence leaves commits, PRs, exit-gate documents and a next-work item in GitHub. If a session ends, the repository remains the authoritative construction state; no hidden background execution is claimed.

## SKILL-13 — Cost/Token Efficiency
Prefer deterministic local validation, repository inspection and targeted tests before expensive model calls. Use specialized agents only when they materially reduce implementation risk or time.

## SKILL-14 — No False Completion
If one exit gate is missing, status remains IN PROGRESS. The next action is the earliest unmet gate, not a cosmetic status update.

## SKILL-15 — Production Readiness
Before launch, require secret management, backups/restore tests, migration rollback strategy, rate limiting, abuse controls, incident response, audit retention, reconciliation operations and partner/regulatory sign-off.
