# TPAY-COST-001 — Low-token / Free-tier Engineering Skill

## Objective
Maximize implementation progress under constrained AI/API budgets without sacrificing correctness.

## Protocol
1. Repository-first: inspect tree and exact files before asking the model to recreate context.
2. Context compression: keep architecture decisions in short canonical files.
3. Search-before-write: never create a helper until repository search confirms no equivalent exists.
4. Patch-first: modify only the smallest required region.
5. Test locality: run unit tests for the changed domain before broad CI.
6. Batch independent reads/tool calls; serialize mutations when order matters.
7. Prefer deterministic scripts over repeated natural-language generation.
8. Generate schemas/types once and reuse them.
9. Cache stable reference material in versioned docs.
10. Escalate to expensive models/tools only for architecture, security, debugging or genuinely ambiguous work.
11. Use structured outputs and machine-readable manifests for agent handoffs.
12. Stop generation when acceptance criteria are satisfied.

## Anti-burn rules
- No speculative refactors.
- No duplicate documentation.
- No full-file regeneration when a patch is sufficient.
- No repeated explanation of unchanged architecture.
- No external API call when a local invariant can answer the question.

## Acceptance metric
Every task should report: files changed, tests added/updated, risk introduced, estimated recurring cost impact, and next dependency.
