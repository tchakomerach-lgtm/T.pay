# Layer 7 Construction Record — Payout + beneficiary rotation

**Status:** IN PROGRESS — foundation implemented; provider/ledger integration remains.

## Implemented
- payout state machine;
- positive minor-unit amount and currency validation;
- KYC gate;
- human approval default and self-approval prevention;
- organization-scoped idempotency schema;
- approval persistence;
- deterministic beneficiary rotation foundation;
- live PostgreSQL isolation/idempotency test.

## Not yet complete
- concrete payout provider adapters and signed callbacks;
- atomic payout-to-Ledger posting integration;
- payout reconciliation/exception integration;
- full KYC/beneficiary eligibility service;
- production Mobile Money/TMoney/Flooz payout execution.

Layer 7 must not be declared complete until these boundaries and adversarial concurrency tests are green.
