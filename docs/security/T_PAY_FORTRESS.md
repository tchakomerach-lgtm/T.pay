# T.Pay Fortress — Cryptographic Cell Architecture

## FORT-001 — Root trust
The root-trust vault is a trust anchor, not an application data store. Root material must remain in an external HSM/KMS boundary. Application code receives references/operations, never exportable root keys.

## FORT-002 — One vault identity per security layer
Each security/functional layer owns a distinct vault identity, namespace and key reference. A vault never receives another vault's key material.

Initial cells include: Security, Recovery, Identity, AI, Organization, Finance, Ledger, Payment, Wallet, Credit, Provider, Microfinance, Tontine, Data/RAG, Document, Social, Audit/Evidence and Offline/Field.

## FORT-003 — Key hierarchy
Production target:
HSM/KMS Root Trust → vault KEK/wrapping key → vault DEK → encrypted data/object.

DEKs are ephemeral/application-scoped where possible. Root keys are never stored in PostgreSQL, source control, environment variables or model context.

## FORT-004 — Controlled bridges
No direct cross-vault read/write is permitted. A bridge is explicit, directional, purpose-bound, action-bound, data-class-bound and TTL-bound.

## FORT-005 — Security Gateway
Every cross-vault operation must carry:
organization, actor, agent, source vault, target vault, purpose, action, data class, capability, correlation ID, payload hash and expiry.

The gateway must enforce vault status, tenant boundary, bridge policy, capability validity, authorization, replay protection, risk/approval requirements and evidence recording before a side effect.

## FORT-006 — Compromise containment
A compromised vault can be quarantined independently. Quarantine blocks bridge operations involving that vault while unaffected vaults remain operational. Evidence is preserved; recovery requires explicit controlled transition.

## FORT-007 — No universal administrator key
Administrative identity does not imply cryptographic access. Root/financial/security operations require separate authorization and, where applicable, multi-party control.

## FORT-008 — Persistence and RLS
Vault and bridge metadata are persisted with PostgreSQL RLS. Organization-scoped vaults are invisible across tenants. Global root metadata is deliberately non-tenant data and must be protected by separate privileged infrastructure controls.

## FORT-009 — Provider boundary
The repository contains only a fail-closed KMS/HSM adapter contract plus a test-only provider. It is NOT production HSM/KMS activation until a real provider, key ceremony, access policy, rotation and recovery evidence exist.

## FORT-010 — Failure rule
If key provider, vault status, tenant context, authorization, capability, replay protection or security evidence is unavailable, the cross-vault operation fails closed.

## Current state
Implemented in code: vault registry, per-vault key references, testable wrapped DEKs, explicit bridges, quarantine, tenant checks, and PostgreSQL persistence/RLS migration.

Not yet production-ready: real HSM/KMS provider activation, full persistent bridge execution path, full Ledger/Payment wiring, runtime replacement of all in-memory replay/capability paths, PostgreSQL adversarial integration evidence and regulated activation.
