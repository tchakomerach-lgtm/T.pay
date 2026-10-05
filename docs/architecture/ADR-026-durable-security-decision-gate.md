# ADR-026 — Durable Security Decision Gate

## Status
Proposed — SEC-074 construction.

## Decision
T.Pay uses one durable security boundary for replay prevention, human approval consumption and security-event provenance.

### Replay
A replay claim is scoped by tenant + JTI. The first accepted digest owns the JTI. Reuse with the same digest is an idempotent replay; reuse with a different digest is a hard security conflict.

### Approval
A human approval is scoped by tenant + approval ID and bound to the exact security request digest. Consumption is an atomic state transition from pending to consumed and requires an unexpired approval.

### Provenance
Every security decision records policy version/revision, rule IDs, request digest and decision source. Security events are hash-linked per tenant to improve tamper evidence while keeping sensitive metadata out of the event record.

### Boundaries
No local cache, offline queue, UI flag, AI model output or provider callback can be treated as authoritative authorization.

### Consequences
The authoritative command path must invoke this gate before high-impact organization, AI, payment, credit, microfinance or ledger mutations. Migration/retention operations are part of release readiness.
