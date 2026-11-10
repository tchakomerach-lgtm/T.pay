# Fortress Admin Plane Isolation — P057 Security 001

## Decision

Super Admin is a separate control plane. It is not an ordinary user session with a stronger assurance flag. The User Plane cannot become the Admin Control Plane by setting `step_up`, changing an organization role, or supplying an organization identifier.

The platform uses one canonical Vault schema (`tpay_vaults`, migration 047). Do not create a parallel `fortress_vaults` schema. The older `fortress_vaults` migration family is not the active T.Pay Vault implementation.

## Implemented in this increment

- Adds the `super_admin` vault class with a platform-only scope: tenant `__platform__`, no organization, no owner actor, module code `super-admin`.
- Requires the Super Admin vault to be a child of an `administrator` vault in the same tenant. The composite tenant/parent foreign key prevents cross-tenant parent links.
- Creates `tpay_admin_runtime` as a `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, `NOINHERIT` database role.
- Replaces the existing permissive Vault policies rather than adding a second permissive policy. PostgreSQL permissive policies are OR-combined; leaving the old policy in place would risk reopening a User Plane path.
- Restricts the Admin runtime role to platform Super Admin vaults and requires an exact active grant, exact vault ID, explicit permission, a privileged-session context, and the absence of a user-session context.
- Explicitly denies ordinary User Plane roles access to both the Super Admin vault and its platform-only administrator parent.
- Preserves tenant/organization-scoped access to all non-Super-Admin module vaults. Parent-vault access is not inherited.
- Makes Vault audit append-only with database privileges and a trigger, including protection against table-owner UPDATE/DELETE.
- Adds a pure policy decision point for USER, ORGANIZATION, ADMIN_CONTROL and attested SERVICE planes.
- Adds unit and PostgreSQL integration tests for role separation, cross-plane denial, tenant/organization isolation, exact-vault grants, session expiry/revocation and append-only audit.
- Adds the new boundary to the Security Fortress CI gate.

## Plane and vault model

| Plane | Principal/session | Vault scope | Allowed authority |
|---|---|---|---|
| User | User identity + user session | User-owned vaults | Exact object/vault grant |
| Organization | Member identity + organization-bound session | Tenant + organization + module vault | Explicit organization permission and exact vault grant |
| Admin Control | Privileged identity + separate privileged session | `__platform__` / `super_admin` vault only | Hardware-backed assurance, exact grant, short lease, PAM/quorum for high impact |
| Service | Workload identity + attested workload session | Tenant + module vault | Workload allowlist and exact capability |

Domain vault classes remain separate: `identity`, `finance`, `ai`, `organization`, `data_rag`, `document`, `social`, `offline_field`, `audit_evidence` and `user_module`. A module does not gain access to another module's vault through a parent relationship. Cross-domain operations must use a narrow, time-bounded capability issued by the relevant policy broker and must be audited.

## Fortress hierarchy

`Root Trust → General Fortress → Administrator Fortress → Super Admin Vault`

The hierarchy is a governance/containment relationship, not an inheritance chain. A child vault does not inherit decryption rights from its parent. Root operations remain subject to independent-domain quorum and request-digest binding. The Super Admin identity is not automatically entitled to decrypt Finance, Identity, School, Microfinance, Tontine or user data.

## Cryptographic boundary

- PostgreSQL stores KMS/HSM references and encrypted object metadata, never raw key material.
- Vault payload encryption continues to use AES-256-GCM with per-object nonce, authentication tag and AAD binding.
- Data-key unwrap/decrypt remains an external KMS/HSM broker operation; application code must not receive long-lived root keys.
- Key versions are explicit. Rotation/revocation must be auditable and must not rewrite historical ledger evidence.
- Crypto-agility is required for future approved hybrid/post-quantum algorithms. No future 2030 standard is represented as already certified.

## Deployment prerequisites — not completed by this migration

1. Provision a dedicated Admin API process/listener and separate network policy/hostname. Do not mount it behind the ordinary User API session resolver.
2. Provision a distinct database login for that process and grant it membership in `tpay_admin_runtime`. Never grant that membership to the User Plane database login.
3. The Admin API must use its own `__Host-tpay_admin_session` cookie (Secure, HttpOnly, SameSite=Strict, Path=/), with no shared user cookie or bearer fallback.
4. The privileged session issuer must verify a registered hardware-backed WebAuthn credential, user verification, challenge freshness, signature, credential binding and authenticator counter/replay policy before issuing the session.
5. Every request must resolve the privileged session independently, check active identity, device, expiry, revocation, assurance and exact capability, then set transaction-local Vault context.
6. PAM commands require JIT/JEA grants, command allowlists, one-shot or short leases, command digest audit and immediate termination/revocation.
7. Root Trust operations require independent approvers from distinct provisioned trust domains, quorum and exact request digest. Self-approval is forbidden.
8. HSM/KMS key operations, immutable/WORM backup restore drills, recovery clean-room and red-team gates must pass before production enablement.

The migration must be executed by a controlled schema-migration identity capable of applying RLS/role DDL and evaluating the SECURITY DEFINER parent-integrity guard with row security disabled. This identity is never an API runtime credential. The migration creates only the NOLOGIN role and PostgreSQL boundaries. It does not create a login, grant role membership, activate an Admin API, provision HSM/KMS, or certify WebAuthn/PAM. These must be wired and evidenced separately. Do not mark the Admin Control Plane production-ready until those prerequisites are implemented.

## Rollback and operational notes

The migration is additive except for replacement of Vault RLS policies and is applied through the existing ordered migration runner. Rollback must not weaken isolation by restoring the old permissive policies. If deployment prerequisites are unavailable, keep the Admin Control Plane unavailable (fail closed); do not fall back to user sessions or the ordinary database login.

## Verification

- Unit policy tests: added.
- PostgreSQL role/RLS/audit integration test: added; execution awaits exact-head CI.
- Security Fortress static gate: extended.
- Live KMS/HSM, separate Admin API, hardware WebAuthn, PAM connector, Root Trust quorum, clean-room restore and terrain certification: not yet evidenced.
