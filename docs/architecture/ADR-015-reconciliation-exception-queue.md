# ADR-015 — Reconciliation Exception Queue
Status: Accepted — S-03.8.

Reconciliation mismatches become durable exceptions. They never directly alter Ledger, Payment, Contribution, Wallet or Credit state. Any eventual financial correction must use the existing financial state machine and atomic Ledger UoW with its own authorization and idempotency key.

Exception identity is (organization_id, kind, evidence_hash). The database is authoritative for deduplication and concurrency. Amount, currency and identity divergence are critical; provider-only, internal-only, status mismatch and duplicate provider event are high.

Queue claims are tenant-scoped and investigator-bound. Resolution records a code but is not itself a financial correction.

PostgreSQL documents FOR UPDATE and SKIP LOCKED for row locking and queue-like concurrent work. No provider data becomes financial truth merely because it is present in the exception queue.