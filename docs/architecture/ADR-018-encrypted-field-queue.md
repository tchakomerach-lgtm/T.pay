# ADR-018 — Encrypted local field queue

**Status:** Proposed — construction sequence L6.3

## Decision
Field/offline envelopes stored locally are encrypted with AES-256-GCM. Queue records bind authenticated metadata (envelope ID and key ID), use random nonces, and never expose plaintext envelope payload in storage/logging. Queue keys are supplied by a platform key provider; long-term master secrets are not embedded in application code.

The synchronization worker is bounded, idempotent, retry-limited and exponential-backoff based. Server acceptance/duplicate/rejection remains authoritative. Local queue state can trigger retry or quarantine but cannot post Ledger state.

## Security invariants
- ciphertext and authentication tag are required for local persistence;
- wrong key or tampering fails closed;
- queue size/batch/attempts are bounded;
- accepted and duplicate server results remove the local intent;
- rejection is quarantined, never silently retried forever;
- worker failures cannot mutate financial truth;
- key material never enters logs or receipt evidence.

## African field constraints
The queue is designed for intermittent 2G/3G/4G, power loss and long offline periods. Backoff avoids network storms after restoration. Future mobile adapters must use OS/hardware-backed key storage where available and must not downgrade to plaintext fallback.
