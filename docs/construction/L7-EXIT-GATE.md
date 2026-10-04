# Layer 7 exit gate

Layer 7 construction now includes payout intent, approval, KYC gate, provider initiation/query, durable signed callback evidence, replay barrier, reconciliation exceptions, provider reversal, immutable original ledger entry and idempotent reversal transaction.

Mandatory exit controls:
- exact-head CI success;
- migrations type-safe and tenant-scoped;
- canonical KYC eligibility bound to payout beneficiary;
- PostgreSQL concurrency tests for duplicate callbacks and duplicate reversals;
- outbox/audit event emission wired by the production handler;
- provider adapters for TMoney/Flooz/PI-SPI/MFI remain contract-driven and require partner credentials/certification before live activation.

A provider certification or production credential cannot be fabricated by repository code. Until a licensed partner supplies credentials and passes its certification process, T.Pay must remain in sandbox/contract-test mode for that rail.


## Callback replay/concurrency gate
Two concurrent callback workers for the same tenant/provider event must converge to one durable callback outcome. A second delivery may be acknowledged as a replay only after the first event is durably recorded; ambiguous payloads remain quarantined. Provider retries must never create duplicate Ledger truth.
