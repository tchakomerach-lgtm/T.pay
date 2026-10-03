# TPAY-SEC-001 — High-Assurance Security Skill

## Default posture
Deny by default, least privilege, explicit trust boundaries, immutable audit evidence, defense in depth.

## Required controls
- WebAuthn/passkeys as a phishing-resistant authentication option.
- Short-lived organization sessions with explicit organization binding.
- Step-up authentication for sensitive operations.
- RBAC + contextual authorization.
- Idempotency and replay protection for financial commands.
- Signed and verified provider webhooks.
- Append-only audit events with actor, session, organization, resource, action and outcome.
- Secret rotation and secret scanning in CI.
- Rate limiting and abuse controls at identity, IP/device, organization and operation levels.
- Data minimization, field-level redaction and encryption at rest/in transit.
- Dependency/SBOM and vulnerability gates.
- Backup integrity and restore drills.
- Security incident playbooks.
- AI prompt/tool/data isolation.

## Financial rule
No AI, webhook, frontend or external provider may directly mutate balances. All money movement enters through authorized commands and the ledger.

## Testing
Every security-sensitive feature requires negative tests: unauthorized, cross-organization, replay, malformed input, privilege escalation and failure/recovery paths.
