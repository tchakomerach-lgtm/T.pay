# P057.4.1 — PostgreSQL isolation for provider reconciliation

## Purpose
Close the database-level tenant-isolation gap for durable Community Tontine reconciliation findings.

## Implementation
- Migration 119 enables and forces PostgreSQL Row-Level Security on `tontine_reconciliation_findings`.
- A single organization-scoped policy uses the canonical `tpay_current_organization_id()` context already referenced by the Fortress RLS migrations.
- Missing organization context resolves to NULL and denies reads/writes.
- Public privileges are revoked. Runtime grants remain governed by the deployment's least-privilege role provisioning; this migration does not invent a role name or grant broad table access.
- Existing application-level organization predicates remain required as defense in depth.

## Security boundary
The table stores operational reconciliation evidence only. RLS does not grant permission to settle, reverse, refund, hold, or mutate Financial Core. Such actions remain separate, explicitly authorized Financial Core commands.

## Acceptance gates
1. Apply the complete migration chain on PostgreSQL 17.
2. Verify RLS and FORCE RLS catalog flags.
3. Verify the canonical organization-context function exists and returns the authenticated organization.
4. Run as a non-owner, NOBYPASSRLS runtime role: no-context denial, same-organization access, cross-organization denial, and write isolation.
5. Verify runtime grants are limited to required SELECT/INSERT/UPDATE operations; DELETE is not granted.
6. Run concurrent callback reconciliation and replay tests; verify one durable finding and no duplicate transition notification.
7. Complete the full CI suite, Web/Android checks and dependency audit before certification.

## Explicit limitation
This increment does not claim that production runtime grants or live PostgreSQL RLS tests have passed. Those are CI/deployment acceptance gates, not inferred from the migration text.
