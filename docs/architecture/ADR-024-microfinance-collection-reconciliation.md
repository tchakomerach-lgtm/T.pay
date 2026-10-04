# ADR-024 — Durable microfinance collection and cash reconciliation

## Decision
Persist field collection intents independently from the Financial Core and reconcile agent cash sessions through an exception-first workflow.

## Invariants
- (organization_id, idempotency_key) is unique.
- Field collection data is intent/evidence, never financial truth.
- Expected cash is deterministic from opening float and movements.
- Shortage, overage, currency mismatch, missing evidence and duplicate collection become reviewable exceptions.
- No automatic corrective ledger posting follows a mismatch.
- Organization boundaries are enforced by database keys and repository queries.

## Togo/Africa
Cash-first operations, intermittent connectivity, mobile-money rails and partner-MFI settlement are supported. GPS is optional evidence, not a financial authorization factor.

## Remaining work
Live provider clients, full KYC/eligibility, credit underwriting/disbursement/recovery, school-finance orchestration and production reconciliation UI remain outside L9.2.
