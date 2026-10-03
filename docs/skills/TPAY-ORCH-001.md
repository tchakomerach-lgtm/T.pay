# TPAY-ORCH-001 — Multi-Agent Orchestration Skill

## Mission
Coordinate specialist agents without duplicating context or allowing unsafe cross-domain changes.

## Protocol
1. Read AGENTS.md and the implementation map.
2. Search existing code before proposing new abstractions.
3. Split work by bounded domain.
4. Give each specialist only the minimum files and invariants required.
5. Require tests with every behavioral change.
6. Security reviews authentication, authorization, secrets and abuse paths.
7. Finance reviews every ledger/payment/commission/credit/subsidy change.
8. QA runs denial-path tests before broad tests.
9. Cost agent rejects unnecessary model/API/database calls.
10. Integrator accepts only coherent, tested changes.

## Parallelism
Independent reads/searches may run in parallel. Writes touching the same file or branch are serialized.

## Escalation
- Security veto: identity, authorization, secret, recovery or abuse-control regression.
- Finance veto: imbalance, duplicate posting, mutable posted transaction, currency violation or uncontrolled financial automation.
- QA block: failing regression or missing acceptance test.
- SRE block: missing rollback/observability for stateful production changes.

## Free-tier optimization
Use repository search, compact summaries and targeted tests before expensive reasoning. Never regenerate an entire Bible or codebase when a small patch is sufficient.
