# ADR-008 — Provider Adapter Registry and Contract Boundary

## Decision

T.Pay introduces a provider integration fabric between payment intent/orchestration and external providers.

The authoritative flow is:

`authorized payment intent → provider adapter → normalized provider result → verified callback/query → Settlement Orchestrator → PostgreSQL atomic UoW → Financial Core`.

### Provider boundary

Every provider implements the same internal contract:

- immutable provider identity and contract version;
- explicit capability flags;
- payment initiation;
- status query;
- callback verification;
- normalized status;
- correlation identifier;
- idempotency propagation.

Provider-specific payloads, credentials, HTTP semantics and response quirks remain inside the adapter transport. Raw provider responses never become financial-domain objects.

### Financial authority

An adapter cannot post the ledger, mutate balances, confirm a contribution or mark a beneficiary paid. A provider result is evidence/input only.

A provider status of `confirmed` is not sufficient by itself to post money: T.Pay must verify the provider event against the payment intent (organization, payment ID, provider reference, amount, currency and idempotency key) and pass through the atomic Settlement Orchestrator.

### Status semantics

`initiated` and `pending` are non-settled states.

`confirmed` permits the settlement workflow to evaluate the event; it does not bypass authorization or persistence checks.

`failed` means the provider has authoritative failure evidence.

`reversed` is a separate provider outcome and requires an explicit reversal workflow; it never edits the original ledger entry.

A timeout or network disappearance is not automatically `failed`; it remains an unknown/pending operational condition until T.Pay obtains authoritative evidence.

### Retry and circuit breaker

Provider calls use bounded retries only for classified transient failures. Non-idempotent operations must never be blindly retried without the same idempotency key.

Circuit breaker state controls new provider attempts only. Opening a circuit cannot reverse or alter already-posted financial state.

### Mismatch quarantine

If provider evidence disagrees with the internal payment identity, amount, currency, organization or idempotency identity, T.Pay routes the event to reconciliation/quarantine. It does not settle or "fix" the money automatically.

### Security

Callbacks are untrusted input and require signature verification, freshness and replay protection before financial processing. Provider credentials are external secrets and never committed to Git.

### Research basis

OWASP's Third Party Payment Gateway guidance emphasizes server-side verification of provider callbacks and matching transaction identifiers/amounts rather than trusting client/provider claims blindly. OWASP business-logic guidance requires atomic check-and-act/idempotency and consistent business-rule enforcement at every entry point. citeturn0search0turn0search2

### Scope of S-03.1

This brick establishes contracts, registry and resilience primitives. It does not connect live TMoney/Flooz credentials, implement real provider HTTP clients, or authorize financial settlement.
