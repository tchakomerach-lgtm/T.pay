# T.Pay Opportunity — OP-1296 Lifecycle Core

This sequence adds the first persistent Opportunity aggregate and its guarded state machine.

## Implemented

- OP-1296: canonical Opportunity lifecycle states and transition guard.
- OP-1297: PostgreSQL lifecycle transition ledger.
- OP-1298: transactional outbox for realtime state events.
- optimistic version field on the aggregate.
- tenant + organization scoped row locking.
- idempotency key per lifecycle command.
- immutable event hash.
- explicit human approval for high-impact transitions.

## Security model

Agents and automation can only execute transitions explicitly listed for their actor class. Publication, negotiation, contracting, acceptance and recovery require explicit human approval where defined by policy.

The lifecycle repository locks the aggregate row before evaluating and applying the transition. The state version increments inside the same transaction as the state event and outbox record.

If any part fails, state, event and outbox are rolled back together.

## Real-time field behavior

The outbox is the durable hand-off point. A future realtime dispatcher can safely retry publication without changing the business state.

Offline clients must not invent lifecycle transitions. They may queue permitted commands with an idempotency key; the server remains authoritative for state transition.

## Not yet production complete

The following gates remain:
- API authentication/authorization integration;
- live PostgreSQL concurrency test for two simultaneous transitions;
- outbox dispatcher and retry/dead-letter handling;
- Opportunity creation API;
- matching/application integration;
- acceptance/evidence integration;
- audit/observability integration.
