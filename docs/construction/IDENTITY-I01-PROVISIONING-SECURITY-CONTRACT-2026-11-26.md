# I-01 — Legacy Identity Provisioning Security Contract

**Status:** design and implementation acceptance gate; not an implemented provisioning service.  
**Baseline:** `f4f1a767de662c701f37e17b309de46f50b68f19`.  
**Related audit:** `docs/construction/IDENTITY-GLOBAL-ADOPTION-AUDIT-2026-11-26.md`.

## 1. Objective

Migrate an explicitly verified legacy domain actor into the global T.Pay Identity graph without changing the meaning of the legacy identifier, weakening tenant isolation, or allowing an ordinary API session to manufacture its own identity.

The provisioning operation creates a canonical relationship; it does not infer that two records represent the same person.

## 2. Existing data contracts that must remain distinct

| Field | Legacy Education contract | Global Identity contract |
|---|---|---|
| Actor identifier | `education_actors.actor_id text` | `identity_actor_links.actor_id uuid` |
| Organization identifier | `education_actors.organization_id text` | `identity_actor_links.organization_id uuid` |
| Tenant identifier | `education_actors.tenant_id text` | `identity_actor_links.tenant_id text` |
| Domain | Legacy route/table context | `identity_actor_links.domain_code` |

Never cast a legacy actor ID or organization ID to UUID merely because a particular value looks UUID-shaped. The original legacy value is an opaque external key and must be preserved byte-for-byte.

## 3. Trust boundaries

### Ordinary API runtime

The ordinary API runtime may:
- validate DeviceTrust credentials;
- read the canonical Identity context required by an enabled route;
- perform domain operations using the resolved permissions.

It must not:
- create or link global subjects;
- create or approve legacy crosswalk entries;
- grant memberships or permissions;
- change provisioning evidence;
- call an unrestricted database write path for Identity tables.

### Provisioning authority

Provisioning must use a separate, authenticated operational principal. The principal must be independently authorized, attributable to a human or controlled deployment identity, and unavailable to normal API request handlers.

A transaction-local PostgreSQL setting is context, not authentication. A user-controlled parameter or arbitrary `set_config` value cannot establish provisioning authority.

### Approval authority

The approval identity must be distinct from the requester. Self-approval is rejected. Approval evidence must be verifiable against an independently controlled source or approval record; a free-form string supplied by the requester is insufficient.

## 4. Required crosswalk record

The implementation must retain, at minimum:

- stable crosswalk UUID;
- legacy domain code;
- legacy tenant ID as text;
- legacy organization ID as text;
- legacy actor ID as text;
- canonical tenant ID;
- canonical organization UUID;
- canonical actor-link UUID and global actor UUID;
- global subject UUID;
- evidence/approval record identifier and evidence digest where available;
- requester principal and approver principal;
- creation and approval timestamps;
- immutable status and reason code;
- correlation/request ID.

The crosswalk must enforce uniqueness for the relevant legacy identity tuple and for the canonical mapping. It must not store passwords, bearer tokens, raw device credentials, or unnecessary personal data.

## 5. Transaction contract

The provisioning operation must be one atomic transaction:

1. Authenticate the provisioning principal outside caller-controlled request fields.
2. Verify the independently approved evidence and maker-checker separation.
3. Lock the crosswalk/source actor/target membership rows needed to serialize concurrent attempts.
4. Load the exact legacy actor by its full legacy key and verify it is active and belongs to the supplied tenant and organization.
5. Verify the canonical tenant-to-organization mapping exists and is active.
6. Verify there is no conflicting crosswalk, active actor link, revoked mapping, or second canonical subject for the same legacy actor.
7. Create or reuse only the explicitly approved subject and canonical actor link.
8. Create the required tenant and organization memberships with explicit validity windows.
9. Create only the approved domain grants; do not infer permissions from legacy role labels without a separately reviewed mapping table.
10. Write immutable audit evidence in the same transaction.
11. Commit only after every invariant succeeds; otherwise roll back all writes.

The retry contract must be deterministic: an exact replay of an already approved mapping returns the existing result without duplicate rows; any changed or conflicting payload fails with a stable error code.

## 6. Database privilege design

Before SQL or service implementation is merged, document the deployed database role topology and prove it in PostgreSQL tests.

Required properties:

- Runtime role is non-owner, non-superuser, and has no `BYPASSRLS`.
- Runtime role has only the SELECT/EXECUTE rights needed for its API duties and cannot INSERT/UPDATE/DELETE Identity provisioning records.
- Provisioning execution is granted only to the separately authenticated provisioning principal.
- If a `SECURITY DEFINER` function is used, its owner is a dedicated NOLOGIN, NOSUPERUSER, NOBYPASSRLS role; it has only the minimum table/function privileges; it uses a fixed safe `search_path`; it validates the approval record and source/target rows itself; and its ownership does not rely on a superuser or an unrestricted table owner.
- No function trusts a caller-set GUC, request header, actor ID, evidence string, or tenant ID as proof of authorization.
- Direct DML privileges on crosswalk and Identity lifecycle tables are revoked from the ordinary API role.
- Audit mutation is denied to runtime and provisioning callers after insertion.

If the production role model cannot satisfy these properties, stop and resolve the infrastructure/credential design before creating a provisioning endpoint.

## 7. Mandatory adversarial PostgreSQL tests

### Authorization and role separation
- Runtime role cannot create, update, revoke, approve, or delete a crosswalk.
- Runtime role cannot create a subject, actor link, membership, or permission grant.
- Provisioning role without an approved evidence record is denied.
- Requester cannot approve their own request.
- A caller-set tenant, organization, actor, or evidence GUC does not elevate privileges.
- A role with no login, no superuser, and no BYPASSRLS cannot see or mutate another tenant's data outside the approved operation.

### Mapping integrity
- Unknown, inactive, or duplicate legacy actor is rejected.
- Tenant mismatch and organization mismatch are rejected.
- Unknown or inactive canonical organization mapping is rejected.
- Duplicate legacy mapping and duplicate canonical mapping are rejected.
- Revoked mapping cannot be silently reactivated by replay.
- Domain mismatch is rejected.
- Ambiguous source records remain quarantined; no fuzzy matching by name, email, or phone is attempted.

### Atomicity and concurrency
- Failure at each write stage leaves no partial subject, link, membership, grant, or audit row.
- Two concurrent attempts for the same legacy actor produce exactly one mapping.
- Replayed identical approved request is idempotent.
- Replayed request with changed target or evidence fails.
- Concurrent revocation/approval is serialized and fail-closed.

### Audit and data minimization
- Every accepted and rejected attempt has a correlation ID and reason code.
- Audit rows cannot be updated or deleted by runtime/provisioning roles.
- Logs contain no credentials, bearer tokens, or unnecessary personal data.

Tests must execute against PostgreSQL with the real migration chain and actual constrained roles. A skipped PostgreSQL test is not a passing gate.

## 8. API and rollout contract

- No public user-facing endpoint is enabled until the provisioning authority and approval flow are implemented.
- Prefer a controlled administrative command or internal workflow with explicit dry-run output and a signed/approved input manifest.
- Dry-run must show only stable identifiers and validation results; it must not write.
- Apply mode must require an approval reference and a separate authorized principal.
- Start with a small, explicitly selected cohort; never bulk-link all legacy actors.
- Preserve legacy authorization during shadow comparison.
- Record parity mismatches without sensitive payloads.
- Cut over one domain/route at a time after all PostgreSQL and CI gates pass.
- Provide a tested rollback that disables the new route adapter without deleting identity evidence or silently reverting approved links.

## 9. Release acceptance

I-01 is complete only when:
- schema and service are implemented;
- role topology and approval workflow are deployed and documented;
- all adversarial PostgreSQL tests pass (not skipped);
- migration compatibility is proven from a representative pre-Identity database;
- API runtime cannot provision;
- CI, Android, and Flutter checks pass on the same PR head SHA;
- security review confirms the privilege boundary;
- no existing Education route is cut over without I-02/I-03/I-04 evidence.

Until then, legacy actor records remain unlinked and the legacy compatibility path remains active. This is the required fail-closed state.


## 10. Concrete runtime-boundary findings — verified 2026-11-26

The following observations were verified against the repository at commit `87052667842530f576a8d4658a8f755f0ccc3416`. They are implementation blockers, not assumptions about an external deployment.

### 10.1 Bootstrap policy trusts a caller-settable GUC

`migrations/131_identity_session_bootstrap_rls.sql` adds a permissive SELECT policy whose predicate is only:

```sql
api_session_id = NULLIF(current_setting('tpay.api_session_id', true), '')::uuid
```

`packages/identity/src/postgres-runtime.ts` sets this value using transaction-local `set_config` after the TypeScript DeviceTrust validation. PostgreSQL does not know that the GUC value came from that validation. Any database principal with SELECT access to `identity_sessions` can set the same custom GUC itself; the current policy therefore proves row selection by identifier, not authentication of the bearer credential.

The existing RLS test sets this GUC directly while executing as its constrained test role. It verifies exact-row visibility, but does not prove that the GUC was issued by a trusted authentication boundary. The test name/comment must not be interpreted as proof of credential validation inside PostgreSQL.

**Required correction before production adoption:** remove the implication that the GUC is an authentication factor. Establish a database-verifiable bootstrap mechanism bound to a validated session credential, or a separately authenticated database principal with a narrowly scoped operation. Test that a normal runtime role cannot impersonate another session merely by setting a custom GUC. Do not replace this with a SECURITY DEFINER function owned by a superuser or unrestricted table owner.

### 10.2 API pool currently applies migrations and serves requests

`apps/api-server/src/main.ts` constructs one `pg.Pool` from `TPAY_DATABASE_URL`, calls `applyMigrations` through a client from that pool during server startup, and then reuses the same pool for DeviceTrust, Identity, Education, and domain API queries.

The repository code therefore does not demonstrate a distinct least-privilege runtime credential and migration credential. The actual privileges of `TPAY_DATABASE_URL` depend on deployment configuration that is not present in this source audit; do not assume the runtime role is non-owner or NOBYPASSRLS.

**Required correction before production adoption:** split migration execution from API runtime. Use a controlled migration job/credential for schema changes and a separate runtime credential whose database role is NOLOGIN only if used as a role target, NOSUPERUSER, NOBYPASSRLS, non-owner, and granted only the required runtime privileges. Prove the connected role attributes and denied DDL/DML in PostgreSQL CI. Do not expose migration credentials to request-serving processes.

### 10.3 Runtime identity adoption remains partial

The API currently routes only `/v1/tontine/*` through `resolveCommunityTontineIdentity`. Other authenticated routes continue to resolve actors and permissions through `education_actors` and `api_actor_permissions`. This compatibility path must remain until a verified crosswalk, authorization parity, and route-by-route cutover are demonstrated.

### 10.4 Release disposition

These findings do not establish that a production deployment is exploitable; deployment role attributes and network exposure were not available in this repository review. They do establish that the source does not yet prove the required database trust boundary.

Do not enable global Identity provisioning, broaden the bootstrap policy, or cut over Education while these findings remain open. The next implementation must first split migration/runtime credentials and redesign bootstrap authentication, then add adversarial PostgreSQL tests using the actual constrained runtime role. CI success on a documentation-only change does not close these security gates.
