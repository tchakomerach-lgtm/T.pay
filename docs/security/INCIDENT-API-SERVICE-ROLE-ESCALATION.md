# Security incident record — API service identity privilege inheritance

- **ID:** SEC-API-IDENTITY-001
- **Date discovered:** 2026-10-20
- **Branch:** `construction/super-admin-console-009`
- **Severity:** High-priority authorization design defect; exploitability through the complete deployed request path is not yet established.
- **Affected code:** `packages/api-gateway/src/policy.ts`, `authorizeRoute()`
- **Assets/boundary:** Privileged Super Admin API routes and organization-member routes.

## Finding

The previous authorization helper assigned ranks `anonymous=0, user=1, member=2, admin=3, service=4` and authorized any identity whose rank was greater than or equal to the route requirement. Therefore a request classified as `service` passed the helper for an `admin` route and for all lower-ranked human route classes. This collapses two distinct trust domains and can create a privilege-escalation path if a service identity can reach the helper for a human route. Authentication provenance and the complete server call path still need integration verification, so this record does not claim a confirmed deployed exploit.

## Correction

The helper now treats `service` as a separate trust domain:
- `service` identities are denied human `admin`, `member`, and `user` policies;
- a route with policy `service` is allowed only for `service` auth class;
- mismatches return `API_AUTH_CLASS_MISMATCH`;
- the human role rank excludes `service`.

## Regression coverage

`tests/l13-api-gateway.test.ts` now asserts that service identities are denied on `GET /v1/admin/overview` and `POST /v1/ai/runs`. The threat model now records workload identity isolation.

Commits:
- Fix: `68915143300f0ed3dc85e36ba99528309bd4c565`
- Regression tests: `3216a33650bd0e10a03f5c0618861bef98c9458f`
- Threat model: `4cbb962f42011e911d837af8b98a2dc84eacb2cd`

## Verification status

- Regression tests added: yes.
- Tests executed locally: no.
- Exact-head GitHub Actions run `39374185999` on SHA `275bf4247d8c53c11e8e57d85d2fa6edfa4a21ae`: failed before any steps were exposed; step list is empty and log retrieval returns `BlobNotFound`.
- This indicates a job execution/logging failure before test evidence is available; it does not prove the code passes or fails compilation.
- Production exploitability and upstream auth-class provenance remain unverified.

## Required follow-up

1. Restore runner/job logging; inspect billing, repository/org Actions policy and GitHub service status, escalating to GitHub Support with the run IDs if needed.
2. Run `npm run check` and targeted API Gateway tests on the exact candidate SHA.
3. Trace every source of `authClass` to ensure it is derived from verified credentials, never request-controlled input.
4. Add API integration tests proving service credentials cannot access admin routes and human credentials cannot access service-only routes.
5. Keep PR #97 Draft and block production promotion until exact-head CI, independent security review and other Super Admin gates pass.
