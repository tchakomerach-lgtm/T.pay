# P059 — Vault Access Broker and PostgreSQL consumption boundary

## Scope
P059 adds the first runtime path for ordinary USER / ORGANIZATION / SERVICE reads of a P058 encrypted record. It does not activate Super Admin data access. ADMIN_CONTROL is rejected by the P059 broker even when the caller has a hardware-backed Admin session; P060 must connect the independent break-glass executor and its separate DB/KMS authority.

## Runtime sequence
1. API authenticates the actor and builds a server-side DataCompartmentRequest. Client-supplied tenant, actor, session, purpose, grant or compartment values are never authoritative.
2. The policy decision point checks session, tenant, organization, subject, module, data class, exact record, permission, purpose, validity and revocation.
3. A dedicated DB pool connects using a login explicitly granted membership in tpay_data_broker_runtime. The Super Admin identity must never be a member.
4. The broker starts a transaction, sets transaction-local context, and switches to the NOLOGIN / NOSUPERUSER / NOBYPASSRLS role.
5. The broker resolves one exact candidate grant, binds its ID into transaction-local context, then performs a conditional UPDATE. PostgreSQL row locking and the max-use predicate prevent two concurrent calls from consuming the same final use.
6. The same transaction loads ciphertext + wrapped DEK metadata and appends an immutable access audit record. Any failure rolls back the grant consumption and audit together.
7. After commit, the crypto provider performs a KMS/HSM-backed decrypt operation. The broker API receives plaintext, never a KEK or raw DEK. The production provider must keep DEKs inside an isolated cryptographic boundary.
8. The caller receives only the selected record. No wildcard, bulk, sibling-compartment or cross-tenant operation exists.

## Database role
Migration 123 creates tpay_data_broker_runtime as NOLOGIN, NOSUPERUSER and NOBYPASSRLS; it grants only the SELECT, exact grant-use counter update and audit INSERT required by the broker. RLS uses one permissive tenant/plane gate plus restrictive policies for the exact compartment, subject, module, class, record, actor, purpose and consumed grant. This prevents a later broad permissive policy from widening access. Login membership is an explicit deployment action, not performed by migration.

## Important limits
- The TypeScript crypto provider is an interface. A production KMS/HSM adapter, attestation verification and key recovery integration are still required.
- This sequence implements record read only. Writes, metadata-only APIs, bulk exports, legal holds and crypto-shredding are not enabled.
- Admin break-glass execution is deliberately not implemented in this broker. Governance never inherits data-plane access.
- The SQL runtime role is NOLOGIN. Production connection-pool identity provisioning and membership must be performed separately with secret-manager managed credentials.
- The policy module remains defense in depth. The persisted PostgreSQL grant is authoritative for use count and exact record binding.
- A live PostgreSQL integration test applies the full migration chain, verifies role attributes/RLS policy presence, exercises one successful exact decrypt and confirms a replay is denied with one persisted use. Parallel-session contention tests, KMS/HSM contract tests, red-team, backup/restore and green CI remain release gates. Do not merge or certify P059 before they pass.
