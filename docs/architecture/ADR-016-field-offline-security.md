# ADR-016 — Field Offline Execution Security Boundary

## Status
Proposed — construction sequence L6.1.

## Decision
Offline field operations use signed, short-lived envelopes bound to an organization and registered device key. The offline payload is represented as ciphertext; the server never treats client-side plaintext, local queue state, GPS, or UI state as financial truth.

Acceptance requires:
- Ed25519 signature verification over a canonical envelope;
- organization and device binding;
- active/revoked device state;
- bounded freshness and future-clock rejection;
- strictly monotonic device sequence;
- durable replay claim before financial processing;
- idempotency key on every side-effecting envelope;
- synchronization conflict classification without automatic financial correction;
- field receipt evidence based on ciphertext hash and envelope identity;
- deterministic route reassignment as an operational plan, never as implicit financial authorization.

## Why
Field agents operate through intermittent connectivity. Offline mode creates a new trust boundary: the device can be compromised, duplicated, rolled back, or replayed. The offline path therefore queues evidence and intents, not posted financial truth.

## Security invariants
1. An envelope for organization A cannot be accepted in organization B.
2. A revoked/unknown device cannot submit offline work.
3. An expired or future-dated envelope is rejected.
4. A sequence rewind/gap is not silently repaired.
5. The same envelope cannot be claimed twice.
6. Device sequence advancement is conditional and authoritative in durable storage.
7. Receipt evidence never becomes payment proof by itself.
8. Route reassignment cannot directly mutate Ledger, payment, contribution, or credit state.

## Failure/recovery
- Duplicate: acknowledge as already seen only after authoritative replay state confirms it.
- Sequence gap: quarantine until missing sequence(s) are recovered or explicitly resolved.
- Sequence rewind: investigate/reconcile; do not replay.
- Revoked device: quarantine; require supervised recovery.
- Expired envelope: reject; no financial correction.
- Provider/financial processing remains behind the existing Settlement Orchestrator.

## Deferred
Concrete PostgreSQL device registry/replay store and encrypted mobile/USSD queue adapter are subsequent L6.2/L6.3 construction bricks.
