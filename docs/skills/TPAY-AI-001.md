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


## L15 — provider-agnostic AI Core
The AI Core is the sole orchestration plane for T.Pay agents. Specialist agents never call model providers directly. They request inference through a provider registry that supports OpenAI Responses, Anthropic Messages and future compatible providers behind one contract.

Provider selection is policy-driven: organization/data classification, allowed provider list, latency/cost budget, model capability and availability determine routing. Failover must not cross a tenant/data-residency policy boundary. Provider secrets remain outside source code.

### Agent/tool boundary
- Agents are capabilities, not unrestricted chatbots.
- Tools are deny-by-default, versioned, risk-rated and agent-scoped.
- High/critical side effects require explicit approval unless a separately reviewed policy grants automation.
- Financial actions can never write balances directly; they invoke existing Financial Core commands.
- Commercial Growth Agent may discover, rank and prepare opportunities, but direct outbound contact requires consent and policy authorization.
- All agent actions require organization context, request/correlation ID and auditable outcome.

### Scalability
The provider registry is replaceable; model vendors can be added without changing specialist-agent contracts. Routing must support retries with bounded budgets, circuit breaking, health state, fallback and cost telemetry.