# Super Admin Bible — Construction Record 010

## Source
Prompt 003 Root of Trust + Prompt 004 Admin Lifecycle + Prompt 005 PIM/PAM + Prompt 007 Threat Intelligence/Threat Hunting + Prompt 008 Cyber Resilience/Disaster Recovery.

## Real web application increment
- `apps/web/src/admin-console.ts`: added a real sign-in flow through `POST /v1/auth/login`, CSRF token bootstrap, authenticated session logout and registered-credential WebAuthn step-up.
- WebAuthn challenge response now includes active registered credential IDs scoped to the current L4/L5 identities; the browser uses `allowCredentials` rather than relying only on discoverable credentials.
- `apps/api/src/server.ts`: added authenticated `GET /v1/admin/security-posture` read model, available only when the API recognizes a privileged step-up session.
- The recovery view displays recent recovery runs, checkpoint verification states, Root Trust operations and open high/critical findings.
- Added a dedicated Root of Trust page with quorum count, registered trust domains and digest prefixes.
- Added the runtime approval queue with server-derived approval eligibility and the CSRF-protected second-approver action.
- The PAM view displays active privileged sessions and recent Red Team run evidence. These screens are read-only; the UI does not pretend that a session broker, recovery restore, or root operation has executed.
- Responsive styling added for the login screen, recovery records, session tables and logout control.
- `e2e/super-admin-console.spec.ts`: added browser tests for the login/step-up gate and read-only recovery/Root Trust view.

- Added a dedicated Root of Trust navigation/view with quorum count, independently provisioned domains and digest prefixes.
- Added a runtime change-request queue: authenticated read endpoint, approver eligibility from server state, two-person approval action, CSRF and idempotency key; self-approval/duplicate approval remain rejected by the server.
- Added explicit API Gateway allowlist policies for WebAuthn step-up, security posture and runtime request listing; unit tests assert these route policies.

## Root Trust enforcement increment retained
- Quorum rejects duplicate approver identities and approval lifetimes longer than five minutes.
- Each approval domain must match the identity's server-provisioned `trust_domain`.
- Production requires a registered credential and a hardware-backed key marker, and rejects the software-only verification provider.
- Migration `053_root_trust_domain_binding.sql` provisions the trust-domain field with repeatable DDL.

## Security boundaries
- No private key or secret is rendered in the browser.
- WebAuthn assertions are verified against server-registered credential material.
- Administrative read models require an authenticated L4/L5 session with `step_up` assurance.
- Runtime changes remain requests requiring two distinct approvers; the browser cannot directly change the system mode.
- Recovery, PAM termination and Root Trust execution remain blocked until their server-authoritative broker/provider operations are fully integrated.
- A UI status is not a cryptographic attestation or an operational recovery proof.

## Verification status
- E2E tests added for login/step-up, recovery evidence and runtime two-person approval; not yet validated by a successful CI run.
- Latest exact-head workflow on `6bf2fc2e39b5564a934663b131a6f81b828570ad` fails in approximately two seconds with no step records, runner ID 0 and no runner name. GitHub log retrieval reports `BlobNotFound`. The latest head is not CI-certified.
- HSM/KMS signing, hardware attestation, real PAM connectors, immutable backup storage and independent clean-room restore remain production gates.
- PR #97 remains open, Draft and unmerged.

## Next gate
Repair GitHub Actions runner assignment/logging, execute typecheck/build/unit/PostgreSQL/E2E/dependency-audit against the exact head, then test the console against a real HTTPS deployment and a registered hardware-backed authenticator. Only after that, integrate the approved PAM/recovery execution paths; never add fake execution buttons to the UI.
