# ADR-021 — Payout reconciliation and reversal

Payout provider evidence is reconciled against the canonical payout intent before any financial correction. Divergences become explicit exception classes and never authorize automatic ledger mutation. Reversal is legal only after a confirmed payout and must use a new canonical financial transaction, never edit/delete the original ledger posting.
