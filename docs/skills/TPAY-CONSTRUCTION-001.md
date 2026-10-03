# TPAY-CONSTRUCTION-001 — Bible Consultation & Deep-Research Construction Loop

## Purpose
This skill is mandatory for every new T.Pay brick. It turns the project's Bibles, engineering rules, security requirements and external standards into an executable construction gate.

The goal is not to generate hidden chain-of-thought. The loop records only auditable decisions, evidence, constraints, tests and unresolved risks.

## Permanent consultation order
Before changing code, the implementer must consult, at minimum:

1. `AGENTS.md` — current engineering state and global construction rules.
2. `docs/bibles/IMPLEMENTATION-MAP.md` — locate the relevant Bible/domain.
3. Relevant domain Bible/ADR/skill — e.g. finance, security, microfinance, AI, design.
4. Existing implementation and tests for the same boundary.
5. Threat model and security skill for any trust, identity, money, data or provider change.
6. External standards/research when the brick depends on current security, protocol, regulatory, infrastructure or interoperability guidance.

No brick is considered designed until these references have been checked.

## Deep-research loop
For each non-trivial brick:

`DISCOVER → BIBLE-MAP → CURRENT-CODE → EXTERNAL-RESEARCH → THREAT-GATE → DESIGN → IMPLEMENT → TARGETED-TEST → SECURITY-TEST → OBSERVE → COST-REVIEW → CI → RECORD`

### DISCOVER
Identify:
- exact user/field outcome;
- affected bounded contexts;
- authoritative source of truth;
- inputs/outputs;
- dependencies;
- existing implementation to reuse.

### BIBLE-MAP
Write the exact repository paths consulted and extract the constraints that affect the brick. Do not duplicate an existing rule in a new location unless the new location is an explicit adapter or enforcement point.

### CURRENT-CODE
Search before creating. Prefer extending existing ports, types, policies, state machines and UoWs.

### EXTERNAL-RESEARCH
Search only when evidence can change the design. Prefer primary standards and authoritative technical documentation. Record:
- source;
- date/version when relevant;
- design consequence;
- whether the result is adopted, rejected or deferred.

For application security, OWASP ASVS 5.0 is the baseline. For secure SDLC, NIST SSDF is a reference framework. These are complements to T.Pay's own Bibles, not replacements.

### THREAT-GATE
Before implementation answer, in auditable form:
- What asset is affected?
- What trust boundary changes?
- Can this introduce replay, double execution, privilege escalation, cross-organization access, data leakage, fraud or denial of service?
- What happens under concurrency?
- What happens offline?
- What happens when a provider lies, repeats, delays or disappears?
- What is the safe failure state?
- What evidence is retained?

For financial bricks, the DB constraint and atomic transaction remain authoritative.

### DESIGN
Define:
- state machine;
- authorization;
- idempotency;
- persistence constraints;
- event/audit behavior;
- failure and recovery;
- observability;
- rollback/migration if stateful;
- cost boundaries.

### IMPLEMENT
Small deterministic patches. Reuse existing primitives. No speculative refactor.

### TARGETED-TEST
Test the happy path plus at least:
- unauthorized access;
- cross-tenant/context access;
- duplicate/replay;
- malformed input;
- concurrency where relevant;
- provider failure;
- recovery/compensation.

### SECURITY-TEST
Security-sensitive changes require explicit negative tests. Financial changes require proof that no duplicate ledger effect can occur.

### OBSERVE
Define structured events, metrics, traces and alerts appropriate to the brick. Never log secrets, KYC raw data, OTPs or payment credentials.

### COST-REVIEW
Check token/compute/database/provider cost. Prefer deterministic local work and bounded external calls.

### CI
Do not claim completion until the relevant GitHub Actions checks for the resulting commit are green.

### RECORD
Update the smallest relevant ADR/skill/AGENTS state. Record unresolved risks instead of hiding them.

## Loop termination
The loop repeats when:
- a test fails;
- a security gate fails;
- CI fails;
- a Bible constraint conflicts with the implementation;
- new research changes an architectural assumption;
- a provider contract changes;
- a stateful migration lacks rollback;
- an unresolved high-risk exception remains.

The loop stops only when the acceptance criteria and Definition of Done are satisfied.

## Cost discipline
- Batch independent repository reads.
- Use targeted file ranges when possible.
- Search before reading large files.
- Prefer patches over regeneration.
- Do not repeatedly reread unchanged Bibles; record their commit/version reference in the construction record.
- Re-consult a Bible whenever its source file changes, the bounded context changes, or a new risk boundary appears.

## Required construction record
Each substantial brick should leave an auditable record containing:
- Brick ID/name
- Bible/skill paths consulted
- relevant external research
- design decision
- security gate result
- tests added/run
- CI result
- commit SHA
- remaining risks


## Mandatory problem-resolution gate

A construction brick MUST NOT be declared complete while a material problem remains unexplained or unresolved.

For every failure or anomaly:
1. Capture the exact symptom, operation, commit/run identifier and affected boundary.
2. Classify root cause: code, test, schema/migration, CI, provider, infrastructure, permissions, tooling/API, or transient transport.
3. Reproduce when safe.
4. Correct the root cause rather than masking the symptom.
5. Add a regression test, validation, guardrail, or operational control when applicable.
6. Re-run the smallest relevant check, then the full required CI.
7. Record the incident, root cause, fix and verification in the construction record.
8. Only then continue or close the brick.

### GitHub/API timeout recovery

A GitHub ReadTimeout is NOT evidence that a mutation failed or succeeded.

After a timeout:
- do not blindly repeat a mutating operation;
- query the authoritative object/state first;
- for a PR merge, verify merged state, merge_commit_sha, PR state and main head;
- for a file mutation, verify the resulting commit/blob before retrying;
- for workflow operations, query the run/job state before retrying;
- retry only when authoritative state proves the intended mutation did not occur;
- never report success from absence of an error alone.

### CI failure recovery

- identify the failing job and exact error;
- patch the cause;
- never disable a check merely to obtain green CI;
- rerun the narrow failed check before full CI where possible;
- require final green CI for the exact merge head;
- proven recurring infrastructure flakiness becomes an engineering issue to fix.

### Stateful-change gate

Every schema/stateful change requires a forward migration, rollback/compatibility strategy, idempotency or uniqueness barrier, transaction/concurrency analysis, and real-persistence integration coverage where practical.

### Stop condition

Stop only when acceptance criteria are met, material anomalies are resolved or explicitly bounded, security/tests pass, CI is green, and the construction record is updated.
