# TPAY-AI-001 — AI Core / Multi-Agent Skill

## Agent roles
Architect, Security, Finance, Domain, AI, Frontend, QA, SRE and Cost agents.

## Orchestration
- Planner decomposes work into bounded tasks.
- Specialist agents operate only within declared capabilities.
- Reviewer validates contracts and security.
- Integrator merges compatible outputs.
- QA agent runs acceptance and regression tests.
- Security agent can veto unsafe changes.
- Finance agent can veto ledger/payment invariant violations.

## Tool security
Every AI tool has:
- explicit name and version
- JSON schema
- allowed roles
- allowed organizations
- read/write classification
- risk level
- confirmation requirement
- rate limit
- audit event
- timeout
- idempotency behavior

## AI data boundary
KYC, financial, health, education and private organizational data are classified. Agents receive the minimum context required. Sensitive data is not used as generic prompt context.

## Human-in-the-loop
Financial approval, identity recovery, high-risk account changes and irreversible administrative actions require explicit human approval unless a separately reviewed policy enables automation.

## Evaluation
Maintain golden tasks, adversarial prompts, tool misuse tests, hallucination checks, authorization tests and regression datasets. Never evaluate an AI agent only on fluent text.
