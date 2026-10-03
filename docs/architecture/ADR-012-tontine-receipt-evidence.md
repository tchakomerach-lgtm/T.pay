# ADR-012 — Tontine Receipt Evidence Hardening

## Status
Accepted — S-03.5.

## Decision
T.Pay receipts are immutable evidence records bound to the contribution, payment intent, provider reference, amount/currency and posted Ledger transaction.

S-03.5 introduces:
- a deterministic SHA-256 evidence digest over a fixed canonical tuple;
- a server-side HMAC-SHA-256 MAC for authenticity/integrity verification;
- a deterministic receipt-ID derivation primitive for future receipt creation paths;
- a privacy-minimized QR/offline verification payload containing only schema version, receipt ID and digest;
- an explicit rule that QR verification is evidence discovery only and never an authentication, authorization or payment-approval mechanism;
- a database evidence tuple with a uniqueness barrier per organization.

Legacy receipts may temporarily have null evidence fields so migration is non-destructive. New receipt-producing paths must populate evidence before the receipt is exposed as verifiable evidence.

## Security consequences
- Tampering with bound financial fields invalidates the digest.
- Copying evidence from another receipt fails the receipt-ID/context binding.
- The MAC secret never enters receipts, QR payloads, logs or client storage.
- The database remains authoritative for uniqueness and historical persistence.
- No second ledger or accounting state is introduced.

## Operational constraints
- Evidence secrets must be injected through secret management and rotated through a versioned key strategy before production.
- Key rotation must preserve verification of historical evidence; future implementation should add a key identifier without rewriting historical receipts.
- Offline QR verification must be treated as untrusted input and followed by server-side lookup when authoritative status is required.
