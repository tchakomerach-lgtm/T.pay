# L16 — Voice Fabric Construction Record

Date: 2026-10-05
Repository: tchakomerach-lgtm/T.pay
Scope: Prompt 020 — Voice Fabric, telephony, appointments and secure voice operations.

## Authoritative references consulted
- AGENTS.md
- docs/bibles/IMPLEMENTATION-MAP.md
- docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md
- docs/skills/TPAY-CONSTRUCTION-001.md
- docs/skills/TPAY-AI-001.md
- docs/skills/TPAY-SEC-001.md
- docs/skills/TPAY-AUTH-002.md
- docs/skills/TPAY-ORCH-001.md
- docs/skills/TPAY-COST-001.md
- docs/skills/TPAY-VOICE-001.md
- existing packages/api-gateway and provider adapter contracts
- existing migration conventions

## External evidence
- NIST TLS guidance requires/supports TLS 1.3 and the 2026 review is moving the guidance toward current TLS 1.3/IETF practice. citeturn0search0turn0search1
- OWASP TLS guidance recommends TLS 1.3 by default, disabling obsolete TLS and avoiding insecure downgrade. citeturn0search2
- HTTP/3 uses QUIC and TLS 1.3; if HTTP/3 connectivity fails, secure TCP-based HTTP can be used without falling back to cleartext HTTP. citeturn0search3
- NIST notes TLS 1.3 provides forward secrecy and requires visibility/security controls to adapt to encrypted internal traffic. citeturn0search5

## Implemented
1. Secure voice session state machine with explicit legal transitions.
2. Short-lived per-session capability lease identifier.
3. Caller trust assessment that explicitly never treats caller ID as identity proof.
4. Voice action risk mapping V0-V5.
5. Policy-based required verification factors.
6. Exact-action SHA-256 transaction challenge with expiry.
7. Deterministic appointment scheduler reference implementation with tenant isolation and overlap detection.
8. Regression tests for spoofing assumptions, authorization, challenge tampering/expiry, appointment conflict and tenant isolation.
9. PostgreSQL persistence migration 043 with voice sessions, capability leases, transaction challenges, tenant/resource appointment state, overlap exclusion constraint, consent records, security events and encrypted media metadata/retention references.
10. Provider-neutral secure transport policy for HTTPS/TLS 1.3, HTTP/3 preference, WSS validation and private-IP rejection.
11. Provider-neutral voice telephony adapter contract for SIP-TLS/WebRTC-DTLS-SRTP/HTTPS callbacks.
12. Exact raw-body HMAC callback verification with freshness checks.
13. Durable tenant/provider/event replay barrier bound to payload SHA-256.
14. Versioned voice API route contract with idempotency required for mutating routes.
15. Migration 044 for callback replay claims and endpoint policy metadata; provider secrets remain outside PostgreSQL.
16. Targeted transport/provider regression tests.

## Safety boundary
Production execution remains:
Voice -> structured intent -> identity/trust -> policy -> capability -> approval -> workflow -> Tool Gateway -> domain service -> audit.

Financial execution remains exclusively inside Financial Core.

Provider callbacks are untrusted until:
transport authenticity -> exact raw-body signature -> timestamp/freshness -> tenant/provider contract -> durable replay claim -> schema validation -> policy -> domain state transition.

## Verification
Targeted tests added:
- tests/voice-fabric.test.ts
- tests/secure-transport.test.ts
- tests/voice-provider-security.test.ts

GitHub CI status for the current branch is not yet claimed green. Production readiness remains fail-closed until the exact final commit has green required checks.

## Remaining production gates
- provider-specific network clients with real TLS configuration and certificate validation;
- mTLS where contract/risk policy requires it;
- provider sandbox certification;
- PostgreSQL live integration tests for migration 043/044, including concurrent appointment booking and replay claims;
- concrete API HTTP server integration with authz/idempotency and transport enforcement;
- recording/transcript vault and retention workers;
- organization voice configuration UI;
- end-to-end voice red-team suite;
- CI green on the exact final commit.

## Decision
L16.2 secure transport/provider contracts are implemented, but production voice activation remains fail-closed until real provider, persistence, API, red-team and CI gates pass.
