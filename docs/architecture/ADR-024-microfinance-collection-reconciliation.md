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

## Regulatory evidence checked 2026-10-04
- BCEAO PI-SPI Notice n°0019 published 2026-10-02 is treated as a release-relevant interoperability input.
- BCEAO guidance states that issuing electronic money is an authorized activity; T.Pay therefore defaults to a technology/partner boundary and does not model itself as an issuer unless the required authorization exists.
- BCEAO's fintech guidance states that registration in its fintech directory does not itself constitute authorization for regulated activities.

Verify the applicable authorization and contractual perimeter with the competent authorities before production launch; this repository is an engineering control, not legal advice.
