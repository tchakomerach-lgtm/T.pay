# ADR-005 — Tontine Cycle & Field Settlement Pipeline

## Decision
The Community Tontine is implemented as a stateful operational pipeline, not a collection of independent screens.

Canonical lifecycle:

Cycle -> individual schedule -> contribution intent -> field/offline collection -> provider payment -> verified provider confirmation -> financial ledger -> fee/commission -> receipt/e-carnet -> notification -> reconciliation -> beneficiary eligibility -> payout -> cycle closure.

The Tontine domain owns schedules, membership, eligibility, operational states and references. The T.Pay Financial Core owns authoritative posted money state. Providers are adapters and never become the ledger.

## Cycle
A cycle snapshots the configured minimum and the rules version used for that cycle. This prevents later policy changes from rewriting historical expectations.

Schedules are generated only for active memberships. A scheduled contribution becomes due based on its effective date. Confirmation is driven by authoritative financial/provider settlement, not by a client UI action.

## Field continuity
Offline collection is treated as a signed/idempotent command envelope. An envelope is not money confirmation. On synchronization T.Pay verifies device/session integrity, command identity, freshness/replay constraints and provider/ledger state before posting.

Agent reassignment preserves the schedule/contribution identity. The new agent receives only the minimum data required for the assigned route.

## Provider/payment boundary
TMoney, Flooz, partner microfinance and future providers are adapters behind the PaymentProvider boundary. Provider callbacks are untrusted input until signature/replay validation and state validation succeed.

A delayed provider confirmation remains pending. A duplicate callback is a no-op after the authoritative idempotency check. A mismatch creates a reconciliation exception.

## Financial posting
Provider confirmation does not directly mutate a balance. The settlement workflow must atomically:
1. validate the contribution intent;
2. verify provider event;
3. lock/check the contribution state;
4. post the balanced ledger transaction;
5. record versioned fee/commission snapshot;
6. mark contribution confirmed;
7. emit domain events/outbox record;
8. issue a verifiable receipt reference.

If atomic persistence cannot be guaranteed, the system remains pending and reconciliation repairs the workflow through a compensating transaction, never by editing a posted ledger entry.

## Real-world exceptions
- agent unavailable: reassign route;
- phone lost: revoke device/session and re-enroll trusted device; pending server-side commands remain recoverable;
- network outage: queue signed offline envelope, then reconcile;
- provider delay: pending, timeout policy, no duplicate retry without same idempotency key;
- duplicate contribution: return authoritative existing record;
- member late: grace policy and explicit missed state;
- member exits: freeze future schedules, preserve historical records;
- death/inactivity: suspend activity, require authorized workflow for any payout or account action;
- microfinance change: apply to future transactions only after authorization and consent;
- dispute/refund: create case and compensating financial transaction; never delete the original event;
- group suspension: circuit-break new financial commands while allowing safe read/reconciliation operations;
- incident recovery: resume only after outstanding exceptions are evaluated.

## Observability
Every significant state transition is a structured event with stable low-cardinality names and correlation identifiers. Financial identifiers are references, not sensitive payloads. OpenTelemetry event conventions require stable event names and occurrence timestamps. citeturn0search0turn0search7

## Security gate
No state transition may rely only on frontend state, geolocation, provider response text or an offline client claim. Authorization, idempotency, concurrency control, signed provider callbacks and atomic financial persistence are server-side controls.

## Rollout
Introduce the cycle engine behind a feature flag. Start with shadow schedule calculation and read-only operational metrics, then enable contribution scheduling for controlled groups, then financial settlement. Roll back by stopping new commands; never roll back by deleting financial history.
