---
name: tpay-app-builder
description: Governed application-construction skill for extending the existing T.Pay OS repository safely. Use for planning, implementing, testing, reviewing, or integrating T.Pay features; do not use it to scaffold a competing replacement application.
version: 1.0.0
source-inspiration: https://github.com/vudovn/ag-kit
---

# T.Pay Application Builder

## Purpose

Build and improve the existing `tchakomerach-lgtm/T.pay` codebase in small, reviewable increments. This is an adaptation for T.Pay, not a copy of an entire external agent framework. The upstream `vudovn/ag-kit` repository is MIT-licensed; verify its current license and notices before copying any additional files.

## Mandatory operating rules

1. **Inspect before editing.** Read the repository instructions, implementation map, relevant Bible/ADR, package scripts, owning module, tests, migrations, current branch and latest commit. Do not scaffold a second app when a T.Pay implementation already exists.
2. **Plan a vertical slice.** State the user outcome, impacted modules, data changes, API/permission changes, failure modes, observability, tests, rollout and rollback. Prefer one coherent feature per branch/PR.
3. **Preserve system boundaries.**
   - TypeScript remains the current API/control-plane baseline unless an ADR approves otherwise.
   - PostgreSQL is authoritative for financial ledger, transactions, idempotency and tenant constraints.
   - Rust is permitted only for a measured, isolated pilot with versioned contracts, bounds, tests, benchmarks and rollback; do not rewrite the platform wholesale.
   - UI frameworks and animation libraries must not bypass API authorization or business rules.
4. **Security first.** Enforce tenant/org scoping server-side on every read and write; never trust client-supplied role, org, price, balance, status or approval claims. Keep secrets on the server, require HTTPS, validate inputs, apply least privilege, and avoid sensitive data in logs. Use CSRF/session protections appropriate to the endpoint.
5. **Financial integrity.** Use transactional writes, database constraints and idempotency keys for financial mutations. Prevent replay and cross-tenant access. Reassignment, offline collection-route viewing and visit capture must not alter balances or ledger history unless an explicitly reviewed financial workflow authorizes it. Never implement offline financial mutation.
6. **Migrations are additive and safe.** Inspect existing schema and migration order first. Add tenant-safe composite foreign keys where relationships require same-organization ownership. Include rollback/forward-recovery notes and tests for cross-tenant references.
7. **Tests must be real.** Add focused unit tests plus integration/adversarial tests for authz, tenant isolation, concurrency, idempotency, replay and error paths as relevant. Run the repository's actual package scripts locally or through CI when available. Report exact commit SHA, commands, exit codes and links to run logs. A missing runner, missing log, or unstarted job is not a passing test.
8. **Do not bypass CI.** If GitHub Actions fails before a runner is assigned or before any step starts, record that as an infrastructure/execution blocker; do not describe application tests as failed or passed without execution evidence. Inspect workflow, run/job metadata, Actions policy and billing/status evidence; do not speculate about root cause.
9. **No unsafe auto-merge.** Never merge or mark production-ready while required checks are blocked, red, missing, stale, or attached to a different head SHA. Keep sensitive/security PRs Draft until evidence and review are complete.
10. **No invented capability.** Do not claim a deployment, test, secret rotation, provider integration, HSM/KMS attestation, backup restore or device test occurred unless there is verifiable evidence.

## Execution workflow

### A. Discover
- Confirm current repository, branch, head SHA, working tree state and PR status.
- Read the relevant implementation map, ADR/Bible and adjacent code/tests.
- Identify existing contracts and callers before changing interfaces.

### B. Design
Write a concise plan containing:
- acceptance criteria and explicit non-goals;
- data model/migration and tenant boundary;
- API, authentication/authorization and audit requirements;
- UI/offline/realtime behavior, if applicable;
- negative, concurrency and idempotency tests;
- rollout, monitoring and rollback.

### C. Implement
- Make the smallest coherent change.
- Reuse existing patterns and dependencies; add dependencies only with a documented need and license/security review.
- Never place API keys or provider secrets in frontend code, prompts, test fixtures or committed environment files.
- Keep financial state transitions in authoritative server/database services.

### D. Verify
- Inspect the diff for accidental changes and secret leakage.
- Run relevant format, typecheck, unit, integration, security and build scripts that exist in the repo.
- Verify migration behavior and tenant isolation against PostgreSQL when the feature depends on them.
- Trigger or inspect CI on the exact final commit SHA. Capture run/job IDs, runner assignment, steps and logs.
- If execution is blocked, report the precise observable evidence and next diagnostic action; do not infer a root cause from an empty log.

### E. Deliver
Report:
- branch and commit SHA;
- files and behavior changed;
- tests actually executed with results;
- tests not executed and why;
- known risks and rollback;
- PR URL and merge status.

## Definition of done

A feature is complete only when acceptance criteria are met, relevant tests have actually run, tenant/security invariants are covered, the final commit has trustworthy CI evidence, and review/rollout requirements are satisfied. Documentation-only work or a skill file does not make the product production-ready.
