# P058 — Data Compartment Fortress: subject-, domain- and record-level isolation

## Security objective
A stolen password, cookie, user session, organization role, service credential or Super Admin session must not by itself reveal private plaintext. Identity proves who is asking; it is not a data key and is not a standing data capability.

## Data topology
Every subject is represented by an opaque subject reference. For each tenant + organization + module + subject + data class, provision a separate compartment and a dedicated vault boundary. Each record is encrypted independently with a fresh random Data Encryption Key (DEK). The DEK is wrapped by a KMS/HSM-managed Key Encryption Key (KEK) scoped to the compartment and key version. PostgreSQL stores ciphertext, nonce, authentication tag, hashes and wrapped DEK only; never plaintext DEKs or KMS credentials.

A student is not one monolithic record. Example School compartments:
- identity and civil details
- guardianship and parental authority
- academic results and assessments
- attendance and timetables
- health information (separate highly restricted domain)
- safeguarding/incidents (separate highest-sensitivity domain)
- school fees and financial history (Financial Core compartment, not School DB)
- documents and signed certificates
- communications and consent
- biometric data (disabled unless a documented legal basis, consent and dedicated assessment exist)

A record in one compartment does not grant access to any sibling compartment. A teacher's academic grant does not reveal a student's health, guardian, safeguarding or financial records. A parent relationship is represented by an explicit, revocable relationship grant; it does not reveal every child record automatically. A school administrator role does not bypass the compartment policy.

## Key hierarchy and encryption
1. Root Trust keys live in HSM/KMS, with offline recovery and split knowledge. They are never loaded into application memory.
2. Platform/domain KEKs are separated by tenant, module, data classification and environment.
3. Each compartment has its own key lineage and version. High-risk classes (health, safeguarding, credentials, financial) use separate HSM policies and stricter quorum.
4. Each record receives a fresh 256-bit DEK; AEAD encryption uses AES-256-GCM with unique 96-bit nonce and authenticated context (tenant, organization, module, subject opaque ref, compartment, record ID, schema version, key version).
5. DEK is wrapped by its compartment KEK; rotation rewraps DEKs where safe, or re-encrypts data when cryptographic policy requires. Revocation never means deleting an audit trail.
6. Blind indexes are separate keyed HMAC tokens, scoped by tenant + compartment + field; never use plaintext hashes for sensitive searchable fields.

## Access protocol
- Authenticate with a short-lived session; enforce MFA/step-up for sensitive actions.
- Resolve opaque subject and compartment references through an authorized broker.
- Check tenant/org, subject relationship, module, data class, exact record, actor, workload identity, purpose, consent/legal basis, permission, expiry, use count and revocation.
- Obtain a one-use capability bound to the exact record, operation, audience, session, device/workload attestation and expiry.
- Only the broker asks KMS/HSM to unwrap a DEK. The application receives the DEK only inside the narrowly scoped crypto process; it never receives KEK material.
- Decrypt only the selected record. No wildcard, sibling-compartment, bulk or cross-tenant fallback.
- Audit allow and deny decisions, purpose, record reference, key version, actor, session, device and correlation ID. Audit payloads contain no plaintext or secrets.

## Super Admin
Super Admin can govern platform configuration, tenant lifecycle, service health, policy versions and security posture globally. It has no default data-plane grant. A private-data exception requires the separate Admin identity plane, ticketed purpose-bound break-glass, two-person approval (three for decrypt/high sensitivity), short expiry, exact record scope, one-use capability, Vault Access Broker and independent immutable audit. No Admin session can be used as a KMS key or as an organization/user session.

## Cross-module standard
Apply the same model to Identity, Finance, School, Microfinance, Wallet, Tontine, Documents, AI memory/RAG, Voice recordings/transcripts, Social graph/messages, Marketplace, Opportunity, HR, audit evidence and offline field data. Domain services use distinct workload identities and compartment-scoped vault grants. No shared database superuser, master key, global decrypt endpoint or privilege inheritance.

## Database controls
P058 creates compartment, key-version, encrypted-record, exact record-grant and append-only audit tables. RLS is enabled and forced with no permissive policies and no PUBLIC grants. This is deliberately fail-closed: no production service can read the new tables until dedicated least-privilege roles and explicit policies are added. Do not enable broad policies to make a demo work.

## Activation gates
- Implement Vault Access Broker and KMS/HSM adapter with envelope encryption, DEK lifecycle and one-use capability consumption.
- Provision distinct DB roles and pools for each workload/domain; enforce RLS and transaction-local tenant/org/subject context.
- Add transactional grant use-count reservation and consume-once semantics (no race condition).
- Add Postgres integration tests with concurrent requests, RLS adversarial identities, cross-tenant substitution, sibling-compartment denial, grant expiry/revocation and audit immutability.
- Add red-team tests for stolen session, compromised workload, confused deputy, blind-index leakage, ciphertext swapping, nonce reuse, rollback and backup restore.
- Add key rotation, recovery, legal hold, deletion/crypto-shredding and incident response drills.
- Review data minimization, retention, consent and applicable law before production activation.

## Assurance statement
This is a concrete schema and policy foundation. It is not a deployed KMS/HSM service, a completed end-to-end encryption rollout, a security certification or a claim of a defined 2030 standard. The architecture is crypto-agile and must be reviewed against standards current at implementation time.


## PostgreSQL integrity corrections
- The compartment vault reference uses the UUID type of tpay_vaults.id, preserving the composite tenant/vault foreign key.
- Encrypted record storage exposes a unique (tenant_id, id) key so exact tenant-scoped grant foreign keys are valid in PostgreSQL.
- The USER plane cannot enter an organization-owned compartment by omitting or changing its organization context; organization scope must match the persisted compartment on every plane.
