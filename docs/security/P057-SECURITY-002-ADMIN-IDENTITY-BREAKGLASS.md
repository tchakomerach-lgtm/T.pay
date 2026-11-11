# P057 Security 002 — Independent Admin Identity and Break-Glass Governance

## Decision
The Super Admin control plane is separate. It does not reuse or elevate a User Plane identity, cookie, session resolver, API token, database login, or organization membership. Platform governance is global; private data access is not. No standing right exists to read organization records, school files, financial records, vault plaintext, or cryptographic keys.

## Implemented in this slice
- Dedicated PostgreSQL tables for privileged principals, WebAuthn credentials, one-time challenges, Admin sessions, break-glass requests, independent approvals and security audit.
- Forced RLS on each new Admin identity table; no permissive policies or PUBLIC grants.
- Hardware-key requirement in the policy decision point.
- Exact tenant, organization, resource type, resource reference and permission scope.
- Two or three distinct approvers; requester cannot approve; every approver must hold an active hardware-backed Admin session.
- Purpose, justification, incident/ticket reference and maximum 60-minute access window.
- Revocation, expiry, consumption and scope mismatch fail closed.
- Unit tests for session-plane separation, quorum, self-approval, expiry, revocation and pending requests.

## Deliberate deployment boundary
This slice does not expose an Admin API or provision its production database login. WebAuthn ceremony verification, challenge consumption transactions, token generation/hash comparison, session-cookie issuance, KMS/HSM broker integration and break-glass data adapters remain activation gates. Tables remain inaccessible by default under forced RLS.

## Data access protocol
1. Admin authenticates on an independent Admin origin with an independent WebAuthn registry.
2. Admin Session Authority issues a random, short-lived token stored only as a hash and revocable independently.
3. A private-data request specifies purpose, incident/ticket, justification and exact resource.
4. Two independent hardware-backed approvers authorize ordinary break-glass access; decrypt/key operations require three-person quorum plus separate KMS/HSM policy.
5. Vault Access Broker issues a one-use capability; application code never receives KMS/HSM master keys.
6. Every decision and access is audited; approval and audit records are append-only.
7. Access expires or is revoked automatically; no bulk export or cross-tenant query is implied.

## Scope beyond Super Admin
Finance, School, Microfinance, Identity, Documents, AI, Social, Marketplace, Opportunity and Voice must each use domain vaults, exact grants, tenant/org RLS, short-lived capabilities, independent workload identity, immutable audit, no parent-child privilege inheritance and no shared master key. Service principals cannot impersonate users or each other.

## Activation gates
Separate apps/admin-api process, origin, __Host-tpay_admin_session cookie and database login; cryptographic WebAuthn verification with origin/RP-ID binding and one-time challenge consumption; transactional approval workflow and concurrent live PostgreSQL tests; PAM/JIT/JEA; HSM/KMS policy; 3-person decrypt quorum; red-team replay/session-fixation/tenant-substitution/SQL-injection/audit-tamper tests; recovery drill and independent review.

## Security claim
A 2026 implementation foundation designed for crypto-agility and future post-quantum migration. Not a 2030 certification and not production-ready.
