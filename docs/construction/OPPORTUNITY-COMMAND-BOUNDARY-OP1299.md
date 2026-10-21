# OP-1299 — Opportunity Command Boundary

## Implemented

- A transport-neutral command boundary that accepts a principal only from verified authentication middleware.
- Tenant, organization, subject and actor class are derived from that trusted principal; they are never accepted from the command payload.
- Explicit permission gate: opportunity:transition.
- Input validation for command, opportunity identifier, idempotency key and human-approval flag.
- Stable domain error mapping for authentication, authorization, validation, not-found and lifecycle conflicts.
- Response includes request ID, state version and idempotent replay indicator.
- The boundary calls only the lifecycle port; it does not call payment, ledger, arbitrary AI tools or external providers.

## Security constraints

This is not an HTTP server or a complete authentication implementation. The eventual HTTPS adapter must validate TLS at the deployment boundary, verify the session/token, establish tenant context from trusted claims, enforce CSRF/origin rules where applicable, apply request limits, and invoke this function only after authentication. The humanApproval boolean is currently a domain signal and must be replaced or backed by a verifiable approval record before production; a client-supplied boolean alone is not proof of approval.

## Validation

Unit tests cover trusted-principal propagation, authentication and authorization denial before repository access, malformed idempotency keys, and lifecycle conflict mapping. Full repository typecheck/test and live PostgreSQL concurrency certification remain required. Do not treat this component as production-ready until those gates pass on the exact commit.
