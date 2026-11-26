# Identity / Organization / Tenant — adoption audit (2026-11-26)

**Verified baseline commit:** `f4f1a767de662c701f37e17b309de46f50b68f19`  
**Status:** foundation implemented; adoption remains partial; not production-certified.  
**Purpose:** record the current integration boundary and prevent unsafe legacy identity migration.

## Evidence inspected at the verified baseline

- `migrations/045_p039_education_api.sql`
- `migrations/130_global_identity_multiorganization.sql`
- `migrations/131_identity_session_bootstrap_rls.sql`
- `packages/identity/src/postgres-runtime.ts`
- `apps/api-server/src/main.ts`
- `tests/identity-postgres-runtime.test.ts`
- `tests/identity-global-multiorg-schema.postgres.test.ts`
- `tests/identity-global-multiorg-rls.postgres.test.ts`
- `package.json` and the repository workflow definitions

## Verified implementation

1. Migration 130 defines global subjects, explicit actor links, tenant memberships, organization memberships, temporal permission grants, identity sessions, and append-only identity audit structures.
2. Migration 130 deliberately does not backfill legacy actor mappings.
3. Migration 131 adds a bootstrap SELECT policy scoped to the exact API session ID placed in a transaction-local setting after DeviceTrust validation.
4. `resolveOrganizationDomainIdentity` validates UUID-shaped session, actor and organization identifiers plus session time bounds before opening a database connection. It then resolves the provisioned identity in one transaction with transaction-local tenant and organization context.
5. `resolveCommunityTontineIdentity` is a compatibility wrapper over the generic domain resolver.
6. Schema and RLS integration tests exist. The RLS test creates a temporary non-owner, non-BYPASSRLS role and checks cross-tenant visibility boundaries.

## Blocking integration gap

The production API authentication factory in `apps/api-server/src/main.ts` uses the global resolver for the Community Tontine route family; the other authenticated route families still rely on legacy actor and permission resolution, including `education_actors` and `api_actor_permissions`.

The global Identity model is therefore **not yet the universal API identity authority**. Disabling the legacy path before verified provisioning and route-by-route parity would break existing users or assign an incorrect identity.

## Confirmed legacy schema incompatibility

Migration 045 defines `education_actors.actor_id` and `education_actors.organization_id` as `text`. Migration 130 defines `identity_actor_links.actor_id` as `uuid` and `identity_actor_links.organization_id` as `uuid`.

These are different identifier contracts. A direct cast, lossy normalization, or lookup by name, email, or phone is not a migration strategy. A future bridge must preserve the original legacy key as opaque text and associate it with a separately verified global identity through an explicit, auditable crosswalk.

## I-01 — Explicit legacy identity provisioning (release blocker)

The current repository does not yet establish a complete, trusted provisioning authority for creating historical actor-to-subject links. A caller-provided GUC, tenant ID, organization ID, actor ID, or evidence string is not proof of authorization: application-controlled session settings are not an independent security principal.

I-01 must not be implemented by granting the ordinary API database role unrestricted INSERT/UPDATE access to Identity tables. It must not use a SECURITY DEFINER routine whose owner is a superuser, BYPASSRLS role, or table owner with broader rights than the operation requires.

Before implementation, the provisioning security design must establish all of the following:

- A separately authenticated provisioning principal, distinct from ordinary user/API request handling and from the runtime read role.
- A maker-checker or equivalent independently approved evidence workflow; the actor performing the mapping cannot approve their own mapping.
- A canonical crosswalk retaining legacy `domain_code`, legacy actor ID as opaque text, legacy tenant and organization identifiers, canonical tenant/organization, generated global actor UUID, subject UUID, evidence reference, approver, requester, timestamps, and immutable decision status.
- Explicit verification that the source actor exists, is active, belongs to the supplied legacy tenant and organization, and has exactly one approved mapping.
- Explicit validation that the target tenant/organization pair exists and is active, and that the canonical actor link cannot collide with another legacy actor or another tenant/domain.
- One atomic, idempotent transaction with row locks or equivalent concurrency protection; replay must return the existing approved result or fail deterministically.
- Fail-closed rejection of ambiguous, duplicate, revoked, expired, conflicting, cross-tenant, cross-organization, and unapproved mappings.
- Append-only audit evidence with correlation IDs and reason codes, without copying personal data into logs.
- Least-privilege database grants and RLS tests under the actual non-owner runtime role and the separately authorized provisioning principal.
- Negative tests proving that the ordinary API role cannot provision, approve, alter, or delete Identity mappings.

Until the trusted principal and approval workflow are defined and testable, the correct behavior is to keep legacy actors unlinked and retain the compatibility route. This is an intentional security gate, not permission to bypass it.

Detailed implementation acceptance contract: `docs/construction/IDENTITY-I01-PROVISIONING-SECURITY-CONTRACT-2026-11-26.md`.

## Remaining implementation bricks

### I-02 — Canonical API identity adapter

- Introduce a typed API identity adapter mapping verified DeviceTrust sessions to the canonical resolver.
- Select domain from a server-side route registry, never from client-supplied domain or permission lists.
- Keep permission allowlists server-owned and domain-specific.
- Preserve existing Education API response contracts during compatibility.
- Reject unprovisioned sessions on newly enabled domains; never fall back to another domain's grants.

### I-03 — PostgreSQL and security verification

- Run the resolver using the actual non-owner runtime role with NOLOGIN/NOSUPERUSER/NOBYPASSRLS constraints and minimum grants.
- Test bootstrap isolation, transaction-local setting reset on pooled connections, revoked/expired sessions, inactive tenant/organization memberships, revoked/expired grants, wrong actor/domain, and cross-tenant/cross-organization access.
- Test concurrent membership/grant revocation against requests and prove fail-closed behavior.
- Verify FORCE RLS and inspect all permissive/restrictive policies for unintended bypasses.
- Test migration from a representative existing database snapshot and document forward/rollback compatibility.
- Keep the provisioning principal tests separate from ordinary API runtime tests.

### I-04 — Education cutover

- Provision only records with verified mapping evidence.
- Compare legacy and canonical authorization decisions in read-only shadow mode.
- Record mismatches without logging personal or sensitive data.
- Cut over by bounded route/domain only after parity and adversarial PostgreSQL tests pass.
- Retire legacy readers only after coverage, rollback, and field acceptance gates are met.

## Cross-domain adoption order

1. Identity / Organization / Tenant and Education compatibility.
2. Social + People/RH + Opportunité using the canonical subject and membership graph.
3. Health OS with purpose-bound consent and stricter data-class policies.
4. Financial and Tontine routes remain bound to Financial Core and their domain-specific authorization gates.

No module may create a second account, session, subject, tenant, or organization-membership store.

## CI, merge, and field gates

- T.Pay CI: TypeScript, unit/invariant tests, full migration chain, live PostgreSQL integration, security fortress, Web builds, DB-074 contract parity, and dependency audit.
- Android: debug APK build and artifact verification.
- Flutter: analyze, tests, and Android debug APK build.
- PostgreSQL/RLS adversarial tests must run against a configured database; a skipped test is not a pass.
- Terrain certification is a separate self-hosted/device gate; hosted builds do not prove physical-device behavior.
- All required hosted checks must pass on the exact final PR head SHA. PostgreSQL, Android, and Flutter must be validated on that same SHA before merge.
- No automatic merge, no bypass, and no production-readiness claim from contracts or compilation alone.

## Scope of this audit update

Documentation only. No application code, database schema, secrets, provider credentials, financial data, or `main` branch content is changed by this update.
