# TPAY-AUTH-002 — Identity, Passkey and Authorization Skill

## Objective
Build identity as a security boundary, not as a UI feature.

## Rules
- Prefer WebAuthn/passkeys for phishing-resistant authentication.
- Never persist raw passwords, OTPs, recovery codes, organization access codes, or private authentication material.
- Challenges are short-lived, single-purpose, single-use and bound to the user/session.
- Credential counters are checked to detect suspicious authenticator cloning/replay.
- Organization sessions are explicit security contexts; leaving an organization invalidates or shortens the context.
- Authorization is server-side and organization-bound.
- RBAC is the baseline; resource ownership and organization boundaries add contextual authorization.
- High-risk actions require step-up authentication and human approval unless an explicit policy says otherwise.
- Account recovery is a high-risk workflow and must not bypass the same identity controls.
- Tests must include cross-organization access, revoked credentials, expired challenges, replay, privilege escalation and recovery abuse.

## Cost discipline
- Reuse one shared authorization evaluator.
- Keep policy decisions deterministic and small.
- Test denial paths first; they are cheaper and catch boundary regressions early.
