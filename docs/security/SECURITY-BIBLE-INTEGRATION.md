# Security Bible → Construction Integration

The Security Bible is implemented as executable controls rather than copied prose. The canonical integration points are:

- AGENTS.md: mandatory construction governance and stop conditions.
- docs/construction/BUILD-RULES.md: release/build invariants.
- docs/construction/BUILD-SKILLS.md: agent skills and execution methods.
- docs/security/T_PAY_AI_SECURITY_CONSTITUTION.md: AI-specific security constitution.
- docs/security/AUTONOMOUS_SECURITY_SCANNER.md: TASS contract.
- docs/security/THREAT-MODEL.md: evolving threat model.
- tests/: executable evidence; new security controls must add regression tests.

Security Bible controls SEC-001 onward are not considered implemented merely because they are documented. Each applicable control must map to code, test, CI, operational evidence or an explicitly recorded future gate.

## Construction state vocabulary
PLANNED = specified only; IMPLEMENTED = code exists; VERIFIED = tests/evidence pass; INTEGRATED = connected to its real boundary; PRODUCTION-READY = operational/regulatory/DR gates pass; LIVE = authorized production activation.

Agents must never collapse these states into a single 'complete' label.
