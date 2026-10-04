# ADR-028 — Durable payout callback, exception and reversal boundary

**Status:** Accepted — Layer 7.2 construction.

## Decision

Payout provider callbacks are untrusted external evidence. T.Pay verifies the exact raw-body HMAC, freshness, payload schema, provider identity, organization, payout identity, amount, currency and provider reference before accepting evidence.

The database owns duplicate prevention with a unique organization/provider/provider-event key. A duplicate callback is idempotently acknowledged as duplicate evidence; it never creates a second financial effect.

Reconciliation mismatches are persisted as explicit exceptions. They never authorize automatic ledger correction.

A reversal is a new financial transaction. The original ledger entry is immutable. Provider reversal must succeed/confirm before the reversal is financially settled. Human review remains the default for ambiguous or failed reversals.

## Africa/Togo operating rules

- XOF remains integer minor units; no floating point.
- TMoney, Flooz, PI-SPI and partner MFI rails stay behind provider adapters.
- Offline/late provider evidence is quarantined instead of forcing a financial mutation.
- A field agent may capture evidence offline, but cannot manufacture a provider confirmation.
- Provider event IDs are tenant-scoped to prevent cross-organization replay.
- SMS/USSD confirmation is evidence only when it is bound to a provider-verifiable reference; a screenshot alone never authorizes settlement.
