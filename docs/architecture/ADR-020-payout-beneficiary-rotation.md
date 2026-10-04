# ADR-020 — Payout and beneficiary rotation

**Status:** Proposed — Layer 7 construction

Payouts are a Financial Core intent, never a direct wallet mutation. Every payout has an explicit state machine, organization-scoped idempotency, KYC gate and human approval by default. Provider initiation occurs only after approval. Confirmation/reversal must map back to the canonical payment/ledger boundary.

Rotation is deterministic and auditable. Eligibility is policy-driven; prior payout history prevents unfair immediate repetition. Selection is not authorization to pay.
