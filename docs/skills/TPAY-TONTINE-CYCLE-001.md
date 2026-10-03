# TPAY-TONTINE-CYCLE-001 — Cycle & Field Settlement Skill

## Mandatory preflight
Consult:
- AGENTS.md
- docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md
- docs/skills/TPAY-CONSTRUCTION-001.md
- docs/skills/TPAY-MF-002.md
- docs/skills/TPAY-FIN-002.md
- docs/skills/TPAY-SEC-001.md
- docs/security/THREAT-MODEL.md
- docs/architecture/ADR-004-community-tontine.md
- docs/architecture/ADR-005-tontine-cycle-settlement.md
- existing tontine, payment, ledger, commission, webhook and idempotency implementations

## Required pipeline
Cycle -> schedule -> contribution -> collection -> provider -> verified confirmation -> ledger -> commission -> receipt/e-carnet -> notification -> reconciliation -> beneficiary -> payout -> closure.

## Non-negotiable invariants
- Financial Core is the only authoritative posted-money source.
- A provider callback never posts money directly.
- Same logical payment keeps the same idempotency identity across retries.
- Database uniqueness is the final concurrency barrier.
- Fee/commission rules are versioned and snapshotted.
- A cycle snapshots minimum and rule version.
- Offline commands are intents until server verification.
- Historical events are append-only.
- Refunds/reversals are compensating transactions.
- Agent reassignment never changes contribution identity.
- Group suspension blocks new risky financial commands but preserves reconciliation/read continuity.
- Every high-risk payout follows configured KYC/human approval gates.

## Field exception matrix
| Incident | Immediate state | Allowed action |
|---|---|---|
| Agent absent | route_unassigned | reassign route |
| Phone lost | device_revoked | re-enroll after identity verification |
| Network down | offline_pending | sync later |
| Provider delayed | pending | wait/reconcile; do not duplicate |
| Duplicate payment | duplicate_detected | return authoritative transaction |
| Member late | due/grace/missed | apply versioned rule |
| Member exits | exited | freeze future schedule |
| Death/inactivity | suspended | authorized estate/account workflow |
| Microfinance change | pending_partner_change | apply to future operations after consent |
| Dispute | disputed | hold/review where policy allows |
| Refund | refund_pending | compensating transaction |
| Group incident | paused | block new risky commands |
| Recovery | recovery_review | reconcile before resume |

## Test gate
At minimum:
- schedule generation;
- configured minimum snapshot;
- fixed/variable/goal behavior;
- duplicate/replay;
- concurrent command;
- offline replay;
- agent reassignment;
- provider timeout;
- provider duplicate callback;
- provider mismatch;
- ledger idempotency;
- fee snapshot immutability;
- member exit;
- group pause/resume;
- payout KYC/human gates;
- refund compensation;
- cycle closure rejection while unresolved work exists.
