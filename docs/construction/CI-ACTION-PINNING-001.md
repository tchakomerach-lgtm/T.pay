# CI-ACTION-PINNING-001 — Pin GitHub Actions to immutable commits

## Symptom
On 2026-11-08, workflow run `42514974344` for Tontine callback quarantine PR #171 failed during runner setup, before any job step executed:
`actions/checkout@v4` and `actions/setup-node@v4` were rejected because repository policy requires every action to be pinned to a full-length commit SHA.

This is a workflow-policy/configuration failure, not a TypeScript or domain-test failure.

## Implemented
All external actions in the repository's three workflows are pinned to verified full commit SHAs. Human-readable release tags are retained in YAML comments.

| Workflow | Action | Verified release | Commit |
|---|---|---|---|
| ci.yml | actions/checkout | v4.2.2 | 11bd71901bbe5b1630ceea73d27597364c9af683 |
| ci.yml | actions/setup-node | v4.4.0 | 49933ea5288caeca8642d1e84afbd3f7d6820020 |
| android.yml | actions/checkout | v5.0.0 | 08c6903cd8c0fde910a37f88322edcfb5dd907a8 |
| android.yml | actions/setup-java | v5.1.0 | f2beeb24e141e01a676f977032f5a29d81c9e27e |
| android.yml | gradle/actions/setup-gradle | v4.4.2 | 017a9effdb900e5b5b2fddfb590a105619dca3c3 |
| terrain-certification.yml | actions/checkout | v5.0.0 | 08c6903cd8c0fde910a37f88322edcfb5dd907a8 |
| terrain-certification.yml | actions/upload-artifact | v6.0.0 | b7c566a772e6b6bfb58ed0dc250532a479d7789f |

## Research
Commit references were resolved from the official GitHub Actions repository tag refs and dereferenced to commit objects on 2026-11-08. No third-party action was added.

## Security/operations
- Immutable references prevent a mutable tag from silently changing the executed code.
- Existing workflow permissions remain read-only for repository contents.
- No workflow checks were removed or weakened.
- Self-hosted terrain runner remains a separate explicit certification gate.

## Validation status
The workflow YAML changes are committed. CI on this branch must execute and pass before the pinning change is considered complete. Re-run the Tontine callback branch after this prerequisite is integrated.