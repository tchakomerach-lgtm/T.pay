# ADR-009 — Signed Provider Callback Verification

## Decision

Provider callbacks are untrusted network input until authenticity, freshness and replay gates pass.

Pipeline:

raw HTTP request → strict envelope parsing → provider secret resolution → HMAC-SHA256 over exact timestamp + raw body → freshness → atomic replay claim → normalized provider event → Settlement Orchestrator.

The verifier never parses and reserializes JSON before signature verification. The signed bytes remain the exact received body.

## Replay

Replay protection uses an atomic claim(providerId,eventId) contract, not a separate seen() then mark() sequence. The durable implementation must enforce uniqueness at the database boundary.

## Separation

S-03.2 does not interpret provider-specific financial payloads, confirm payments, post ledger entries, update balances or mark beneficiaries paid. A valid signature proves authenticity/integrity under the configured secret; the Settlement Orchestrator must still independently match organization, payment identity, provider reference, amount, currency and idempotency key.

## Threat controls

- forged callback: HMAC verification;
- modified body: exact raw-body signature;
- replay: atomic provider/event claim;
- stale message: freshness window;
- timing leakage: constant-time comparison;
- race: atomic claim + DB uniqueness;
- oversized input: body-size limit;
- malformed identity: strict identifiers;
- secret leakage: runtime resolver;
- direct money mutation: no financial dependency.

## Evidence

OWASP payment-gateway guidance recommends authenticated callbacks, replay protection, idempotency and server-side verification, including matching expected amount, currency and transaction identity before fulfillment. OWASP also recommends TLS for sensitive service communication in addition to message-level controls.

## Scope

This ADR establishes the reusable callback security boundary. Provider-specific schemas and live TMoney/Flooz clients remain separate construction steps.
