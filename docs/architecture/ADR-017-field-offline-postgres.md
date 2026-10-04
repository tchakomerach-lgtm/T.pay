# ADR-017 — PostgreSQL durable field device registry and atomic offline claims

**Status:** Proposed — construction sequence L6.2

## Context

L6.1 established signed offline envelopes and application contracts for device binding, replay claims and monotonic sequence control. Those contracts are not production-authoritative until device state and replay state are durable.

Offline execution is an evidence/intention surface. It must never become a second financial ledger or permit a client device to manufacture financial truth.

## Decision

Persist three security boundaries in PostgreSQL:

1. `field_devices` — organization-scoped device lifecycle, maximum offline lifetime and last accepted sequence.
2. `field_device_keys` — organization/device-scoped public keys with independent revocation state.
3. `field_offline_replay_claims` — immutable envelope claims with uniqueness on envelope identity and device sequence.

The authoritative acceptance operation is a single database transaction:

**claim envelope + verify active device/sequence precondition + advance sequence → COMMIT**

If any part fails, the complete claim is rolled back.

### Invariants

- organization A cannot read or advance organization B's device state;
- revoked devices and revoked keys cannot be accepted;
- one device sequence can belong to at most one envelope;
- one envelope ID can be claimed at most once;
- a sequence can advance only from `n` to `n+1`;
- failed sequence advancement cannot leave a replay claim behind;
- device offline lifetime is enforced server-side;
- replay/sequence state is durable and authoritative;
- receipt evidence remains evidence only and cannot post financial state;
- device registration/revocation does not directly mutate Ledger, payment, contribution or credit state.

### Concurrency model

The database uniqueness barrier protects `(organization_id, device_id, sequence)`. Concurrent claim attempts for the same next sequence may race, but at most one transaction commits the claim and sequence advancement. The losing transaction returns a controlled conflict.

Device revocation is checked by the authoritative transaction before sequence advancement; a concurrent revocation cannot be bypassed by a stale application-level binding read.

### Rejected alternatives

- In-memory replay cache: non-authoritative and unsafe across workers/restarts.
- Client-side sequence only: attacker-controlled.
- Separate non-transactional claim and sequence writes: creates claim-without-advance or advance-without-claim states.
- Financial correction during sync: violates the financial-core authority boundary.

### Operational notes

Key rotation is represented by separate key records while sequence authority remains on the device record. Historical replay claims are retained; cleanup must not erase security evidence needed for audit or incident investigation.
