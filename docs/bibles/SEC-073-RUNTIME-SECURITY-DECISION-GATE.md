# SEC-073 — Runtime Security Decision Gate

Status: IMPLEMENTED on branch construction/sec-073-runtime-security-controls; integration remains gated.

## Purpose
Provide one deterministic, fail-closed decision primitive for security-sensitive requests before they reach domain commands, AI tools, financial actions or organization resources.

## Implemented controls
- Tenant binding for capability and permission.
- Explicit capability scope: resource + action.
- Capability expiration.
- Temporal permission window.
- Emergency/break-glass reason and expiry.
- Human-approval gate for high-impact capabilities.
- Deterministic SHA-256 request digest for approval/audit/replay binding.

## Important boundary
This module is a policy primitive, not a complete authorization system. Production integration must bind it to the durable identity/session store, policy engine, replay barrier, audit/outbox, and domain command gate. No in-memory approval or local-only state is considered sufficient for production.

## Required next integration
1. Bind request evaluation to canonical authenticated session/device identity.
2. Add durable JTI/replay protection.
3. Add policy version + decision provenance.
4. Bind human approval to exact request digest and expiry.
5. Add organization/resource hierarchy checks.
6. Add rate/abuse/risk gates.
7. Add security event telemetry with redaction.
8. Add AI Tool Gateway enforcement.
9. Add financial command enforcement before ledger mutation.
10. Add integration/property/fuzz tests and exact-head CI.

## Field scenarios
- Agent changes phone/device: session re-authentication is required; permissions do not migrate implicitly.
- Offline request: local UI may queue intent, but authorization is re-evaluated server-side when evidence reaches the authoritative boundary.
- Temporary supervisor access: expires automatically; it cannot silently become permanent.
- Emergency access: reason + bounded expiry + audit are mandatory.
- Cross-organization request: tenant mismatch is a hard deny.

## Completion state
This sequence is not PRODUCTION-READY until the integration gates and exact-head CI are green.
