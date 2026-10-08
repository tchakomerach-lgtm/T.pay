# T.Pay Opportunity — OP-1216 Assurance Construction Record

## Scope

This brick materializes the first executable part of the Opportunity Bible Part XX:

- OP-1216–1233: Assurance Fabric, claims, evidence references, contextual trust inputs and commitments.
- OP-1251–1256: minimal agent authority and action receipt primitives required to prevent broad autonomous authority.
- Persistence migration: 100_opportunity_assurance.sql.
- Regression suite: tests/opportunity-assurance.test.ts.

## Boundary

Opportunity owns opportunity-specific assurance state. It does not own:

- identity proofing;
- the financial ledger;
- payment execution;
- model-provider credentials;
- binary evidence storage.

Binary evidence remains outside the relational row; the database stores integrity metadata and SHA-256 references.

## Security decisions

1. Tenant and organization identifiers are mandatory on persistent Opportunity objects.
2. Claims expire explicitly and cannot be considered usable after expiry.
3. Evidence is referenced by SHA-256 and has an explicit integrity state.
4. Agent authority is bounded by organization, resource, action, expiry and action/value budgets.
5. Action receipts bind actor, optional agent, intent, action, policy decision and expected effect.
6. Financial execution remains outside Opportunity and must be mediated by Financial Core.
7. This brick is fail-closed at the domain boundary; no permissive fallback is introduced.

## Remaining production gates

This is not a production-complete Opportunity module. The next gates are:

- PostgreSQL repository with transaction/tenant isolation tests;
- server-side authorization integration;
- evidence object storage adapter and malware/content inspection;
- real-time event publication through the existing event fabric;
- API routes and contract tests;
- matching integration;
- result/acceptance workflow;
- agent runtime integration;
- audit and observability integration;
- CI green on the exact branch head.

## External alignment

The design uses short-lived, resource-scoped agent authority and explicit action receipts. This is aligned with NIST's 2026 direction on agent identity/authorization and OWASP's 2026 Agent Control Standard emphasis on runtime inspection, traceability and policy hooks.
