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
- NIST TLS guidance requires/supports TLS 1.3 and the 2026 review is moving the guidance toward current TLS 1.3/IETF practice. (NIST SP 800-52 Rev. 2; NIST 2026 review: https://www.nist.gov/news-events/news/2026/05/nist-requests-public-comments-sp-800-52-rev-2-guidelines-selection)
- OWASP TLS guidance recommends TLS 1.3 by default, disabling obsolete TLS and avoiding insecure downgrade. (OWASP Transport Layer Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html)
- HTTP/3 uses QUIC and TLS 1.3; if HTTP/3 connectivity fails, secure TCP-based HTTP can be used without falling back to cleartext HTTP. (IETF RFC 9114 HTTP/3: https://datatracker.ietf.org/doc/rfc9114/)
- NIST notes TLS 1.3 provides forward secrecy and requires visibility/security controls to adapt to encrypted internal traffic. (NIST SP 1800-37: https://csrc.nist.gov/pubs/sp/1800/37/final)

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
16. Concrete TLS 1.3-only HTTPS Voice API server with server-side authz and mandatory idempotency for mutating routes.
17. Production HTTPS provider client boundary with certificate verification and injected mTLS material.
18. Live PostgreSQL test coverage for concurrent appointment exclusion and durable callback replay claims.
19. Voice red-team regression coverage for SSRF, downgrade, callback tampering/staleness, mTLS material and tenant confusion.
20. Targeted transport/provider regression tests.
21. Dedicated L16 CI command and PostgreSQL service gate.
22. Encrypted voice media/transcript vault metadata with KMS/HSM envelope references and retention state.
23. Provider sandbox certification harness enforcing protocol/correlation/provider-call identity.

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

GitHub CI status for the current branch is not yet claimed green. The workflow now installs reproducibly with npm ci, runs the complete check, executes the dedicated L16 Voice gate against PostgreSQL 17, and performs the production dependency audit. Production readiness remains fail-closed until GitHub reports green required checks on the exact final commit.

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
