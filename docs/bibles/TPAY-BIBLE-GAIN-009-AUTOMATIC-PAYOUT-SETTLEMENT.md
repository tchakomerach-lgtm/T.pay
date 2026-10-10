# BIBLE GAIN T.PAY — GAIN-009
## Automatic Payout & Settlement OS

**Status:** implementation contract. Production enablement remains gated by provider contracts, durable database enforcement, reconciliation, operational controls and regulatory review.

### 1. Scope
GAIN-007 defines revenue calculation/allocation. GAIN-008 defines treasury ownership and liquidity. GAIN-009 governs payout preflight, scheduling and safe execution using the existing Financial Core, payout state machine, provider adapters and durable settlement path. It MUST NOT create a second ledger or treat protected customer money as T.Pay revenue.

### 2. Non-negotiable invariants
1. A payout request is an intent, not proof that money moved.
2. Every payout is scoped to an organization and carries a stable idempotency key.
3. A provider timeout or ambiguous response is UNKNOWN, not failure; do not blindly retry an external transfer.
4. Provider confirmation is evidence to validate, not permission to mutate the ledger directly.
5. Ledger posting remains in Financial Core and is idempotent.
6. Monetary values use integer minor units/BigInt in domain code and exact decimal integers in PostgreSQL; never IEEE-754 floating-point.
7. Spendable treasury excludes customer-protected funds, merchant/partner payables, tax obligations, reserves and the minimum liquidity buffer.
8. Re-check funds, daily limits and payout uniqueness atomically in PostgreSQL at reservation/execution time. A preflight result alone is not authorization to transfer.
9. A beneficiary cannot approve their own payout. High-risk and threshold-crossing payouts require independent approval.
10. Destination changes trigger step-up verification and a configurable cooling-off period.
11. Provider outage, risk hold, uncertain state or reconciliation mismatch fails closed to HOLD/REVIEW.
12. Retry only when the provider proves the first attempt was not accepted, or guarantees idempotency for the same key.
13. Client status distinguishes queued, submitted, provider_pending, confirmed, failed, unknown, reversed and cancelled. Never label a submitted payout as paid.
14. Each transition records actor/system identity, reason, timestamp, correlation ID, policy version and evidence digest.
15. T.Pay provides execution infrastructure and transparent status; it does not guarantee provider uptime or settlement timing outside its control.

### 3. Preflight decision model
Checks: positive amount; 3-letter uppercase currency; treasury buffer; daily limit; risk holds; verified destination/cooldown; provider availability; required independent approval.
- ALLOW means all preflight checks passed; transaction-level reservation and authorization are still required.
- HOLD means a resolvable identity, risk, provider or approval condition remains.
- REJECT means invalid amount/currency, insufficient spendable treasury or daily limit exceeded.

### 4. Execution and unknown outcomes
Happy path: DRAFT → PENDING_KYC → PENDING_APPROVAL → APPROVED → INITIATED → CONFIRMED.
Before-initiation failures cancel/reject according to the persisted schema. Conclusive provider rejection may fail. Timeout/unknown response enters reconciliation; never blindly initiate again. A later return/reversal is a compensating financial transaction, never deletion or editing of an original posting.
The current persisted schema may have a narrower enum. Any new state requires migration, state-machine, callback mapping and tests in the same change.

### 5. Scheduling modes
- instant: all provider, policy, limits, destination and liquidity gates pass.
- near-real-time: short queue with bounded retry/reconciliation.
- scheduled: explicit date/time and timezone; recheck eligibility and liquidity at execution.
- batch: only where provider/contract permits; preserve per-beneficiary records and idempotency.
- manual_review: independent authorization required.
A schedule never reserves future liquidity by assumption.

### 6. Observability
Metrics: queue age, accepted/confirmed rate, unknown outcome count/age, provider latency, retry count, duplicate suppression, liquidity/daily-limit rejections, destination cooldown holds, reconciliation gap and reversal count.
Alerts: UNKNOWN older than threshold, provider confirmation lag, queue age breach, repeated destination edits, payout velocity anomaly, daily limit near breach, treasury buffer breach and provider concentration threshold.
Logs exclude full destination references, credentials, KYC payloads and raw payment secrets.

### 7. Acceptance gates
- Unit: amount/buffer boundaries, daily limit, invalid timestamp, destination cooldown, risk hold, missing approval and provider outage.
- Security: cross-organization evidence rejected; self-approval rejected; unverified/changed destination held; idempotency payload mismatch rejected.
- Concurrency: concurrent payouts cannot spend the same available funds or exceed a daily limit; database locking/constraints are authoritative, not process memory.
- Provider: timeout-after-acceptance never causes a second transfer; duplicate/out-of-order callbacks do not duplicate ledger posting.
- Recovery: unknown outcomes reconcile against provider statements; confirmed reversals use compensating entries.
- Operations: dashboards expose UNKNOWN and aged queues; emergency mode never unlocks protected funds.
- CI: build, typecheck, targeted tests, complete suite and PostgreSQL integration gates pass.

### 8. Delivery sequence
1. Deterministic preflight policy and unit tests.
2. Durable payout reservation and daily-limit concurrency constraints in PostgreSQL.
3. Provider unknown-outcome state and reconciliation worker.
4. Signed callbacks, replay protection and ledger idempotency.
5. Treasury dashboard, alerts and runbook.
6. Provider sandbox certification. Production remains disabled until partner contracts and compliance approval are documented.
