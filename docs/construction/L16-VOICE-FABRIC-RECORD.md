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
- existing packages/ai provider/tool/agent implementation
- existing migration conventions

## External evidence
- OpenAI current platform guidance: voice/realtime sessions can be connected through realtime transports and controlled server-side; T.Pay therefore keeps authorization, private tools and business policy on the server.
- NIST SP 800-63B-4: biometric comparison based on voice SHALL NOT be used; sensitive voice operations therefore use non-voice step-up factors.
- OWASP 2026 agent guidance: separate decision from execution, bind approvals to exact actions, use short-lived authorization artifacts and replay protection, and fail closed on policy/approval/audit failures.
- OWASP deepfake guidance: do not rely on immature deepfake detection alone; use layered authentication and verification.

## Implemented
1. Secure voice session state machine with explicit legal transitions.
2. Short-lived per-session capability lease identifier.
3. Caller trust assessment that explicitly never treats caller ID as identity proof.
4. Voice action risk mapping V0-V5.
5. Policy-based required verification factors.
6. Exact-action SHA-256 transaction challenge with expiry.
7. Deterministic appointment scheduler reference implementation with tenant isolation and overlap detection.
8. Regression tests for spoofing assumptions, authorization, challenge tampering/expiry, appointment conflict and tenant isolation.
9. PostgreSQL persistence migration 043 with:
   - voice sessions;
   - capability leases;
   - transaction challenges;
   - tenant/resource appointment state;
   - PostgreSQL GiST exclusion constraint preventing concurrent overlapping confirmed reservations;
   - consent records;
   - security events;
   - encrypted media metadata/retention references.
10. Prompt 020 Bible and TPAY-VOICE-001 construction skill.
11. AI Bible registry and persistent engineering state updated.

## Safety boundary
The implementation does not expose direct database mutation to a voice/model output. Production execution remains:
Voice -> structured intent -> AI Core -> Policy/Capability -> Tool Gateway -> domain service -> audit.

Financial execution remains exclusively inside Financial Core.

## Verification
Targeted tests added: tests/voice-fabric.test.ts.
The repository CI workflow is configured to run npm run check and npm audit on every push, but the GitHub connector currently exposes no completed workflow run for the latest direct main commit. Therefore CI GREEN is not claimed in this record until GitHub reports the run.

## Remaining production gates
- provider-specific SIP/PSTN/WebRTC adapter contract;
- signed provider callback validation and replay barrier;
- PostgreSQL integration tests for migration 043 and concurrent appointment booking;
- API Gateway routes with authz/idempotency;
- production recording/transcript vault and retention workers;
- organization voice configuration UI;
- provider sandbox certification;
- end-to-end voice red-team suite;
- CI green on the exact final commit.

## Decision
Prompt 020 domain/reference implementation is committed. Production voice activation remains fail-closed until the remaining provider, persistence-integration and CI gates above pass.
