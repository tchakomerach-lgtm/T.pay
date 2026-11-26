# Identity / Organization / Tenant — adoption audit (2026-11-26)

**Baseline commit:** `19e67636ee64c4d8dbaf09f106ca2d752da44a4b`  
**Status:** partial implementation; not globally adopted; not production-certified.  
**Purpose:** record the verified integration boundary before changing authentication behavior.

## Repository evidence inspected

- `docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md`
- `docs/bibles/IMPLEMENTATION-MAP.md`
- `docs/skills/TPAY-CONSTRUCTION-001.md`
- `docs/architecture/IDENTITY-MULTI-ORGANIZATION-CORE.md`
- `docs/architecture/ADR-006-identity-global-multi-organization.md`
- `migrations/130_global_identity_multiorganization.sql`
- `migrations/131_identity_session_bootstrap_rls.sql`
- `packages/identity/src/postgres-runtime.ts`
- `packages/identity/src/organization-context.ts`
- `apps/api-server/src/main.ts`
- `tests/identity-postgres-runtime.test.ts`
- `tests/identity-global-multiorg-schema.postgres.test.ts`
- `tests/identity-global-multiorg-rls.postgres.test.ts`

## Verified implementation

1. Migration 130 defines global subjects, explicit actor links, tenant memberships, organization memberships, temporal permission grants, identity sessions, and append-only identity audit structures.
2. The migration intentionally does not infer or backfill legacy actor-to-subject mappings. Ambiguous legacy records must remain unlinked/quarantined.
3. Migration 131 adds a narrow bootstrap SELECT policy for the exact API session ID placed in a transaction-local setting after DeviceTrust validation.
4. `resolveOrganizationDomainIdentity` resolves a provisioned session, subject, actor link, active tenant and organization memberships, domain-specific permission grants, and assurance inside one PostgreSQL transaction with transaction-local tenant/organization scope.
5. `resolveCommunityTontineIdentity` is a compatibility wrapper over the generic domain resolver.
6. Unit tests and PostgreSQL schema/RLS tests exist for the identity foundation.

## Blocking integration gap

The production API authentication factory in `apps/api-server/src/main.ts` uses the global resolver only for `/v1/tontine`. All other authenticated routes still resolve the actor and permissions directly from `education_actors` and `api_actor_permissions`.

This means the global Identity model exists in the repository but is **not yet the universal API identity authority**. The Education legacy path is still operationally required; switching it off before verified provisioning would break existing users and could create incorrect identity links.

## Required next implementation bricks

### I-01 — Explicit legacy identity provisioning

- Add an auditable, idempotent provisioning command that accepts a verified mapping between one legacy actor and one global subject.
- Require explicit tenant, organization, domain, actor, approval/evidence reference, and authorized provisioning principal.
- Create subject/actor-link/tenant-membership/organization-membership/grants/session linkage transactionally where applicable.
- Reject ambiguous, duplicate, conflicting, revoked, cross-tenant, and cross-organization mappings.
- Do not auto-link records from matching names, phone numbers, email strings, or other unverified attributes.
- Quarantine unresolved records; preserve the existing Education compatibility path until an explicit migration gate is met.

### I-02 — Canonical API identity adapter

- Introduce a typed API identity adapter that maps verified DeviceTrust sessions to the canonical resolver.
- Select domain from a server-side route registry, never from a client-supplied domain or permission list.
- Keep route permission allowlists server-owned and domain-specific.
- Preserve existing Education API response contracts during the compatibility period.
- Reject unprovisioned sessions on newly enabled domains; do not fall back to another domain's grants.

### I-03 — PostgreSQL and security verification

- Run the resolver using the actual non-owner runtime role with NOLOGIN/NOSUPERUSER/NOBYPASSRLS constraints and minimum grants.
- Test bootstrap isolation, transaction-local setting reset on pooled connections, revoked/expired sessions, inactive tenant/org memberships, revoked/expired grants, wrong actor/domain, cross-tenant and cross-organization access.
- Test concurrent membership/grant revocation against requests and prove fail-closed behavior.
- Verify RLS is FORCE-enabled where required and no permissive policy creates an unintended bypass.
- Test migration from an existing database snapshot and document forward/rollback compatibility.

### I-04 — Education cutover

- Provision only records with verified mapping evidence.
- Compare legacy and canonical authorization decisions in read-only shadow mode.
- Record mismatches without logging personal or sensitive data.
- Cut over by bounded route/domain only after parity and adversarial PostgreSQL tests pass.
- Retire legacy readers only after coverage, rollback and field acceptance gates are met.

## Cross-domain adoption order

1. Identity / Organization / Tenant and Education compatibility.
2. Social + People/RH + Opportunité using the canonical subject and membership graph.
3. Health OS with purpose-bound consent and stricter data-class policies.
4. Financial and Tontine routes remain bound to Financial Core and their existing domain-specific authorization gates.

No module may create a second account, session, subject, tenant, or organization-membership store.

## CI and merge gates

- T.Pay CI: TypeScript, unit/invariant tests, full migration chain, live PostgreSQL integration, security fortress, Web builds, DB-074 contract parity, dependency audit.
- Android: debug APK build and artifact verification.
- Flutter: analyze, tests, and Android debug APK build.
- Terrain certification: separate self-hosted/device gate; hosted builds do not prove physical-device behavior.

All required hosted checks must pass on the exact final PR head SHA. PostgreSQL/RLS and cross-tenant adversarial tests must be green. Terrain and production gates remain separate. No automatic merge, no bypass, and no production-readiness claim from contracts or compilation alone.

## Scope of this audit change

Documentation only. No application code, database schema, secrets, provider credentials, financial data, or `main` branch content is changed by this file.
