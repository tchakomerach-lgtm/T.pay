# Security Bible → Construction Integration

The Security Bible is implemented as executable controls rather than copied prose. The canonical integration points are:

- AGENTS.md: mandatory construction governance and stop conditions.
- docs/construction/BUILD-RULES.md: release/build invariants.
- docs/construction/BUILD-SKILLS.md: agent skills and execution methods.
- docs/security/T_PAY_AI_SECURITY_CONSTITUTION.md: AI-specific security constitution.
- docs/security/AUTONOMOUS_SECURITY_SCANNER.md: TASS contract.
- docs/security/THREAT-MODEL.md: evolving threat model.
- tests/: executable evidence; new security controls must add regression tests.

Security Bible controls SEC-001 onward are not considered implemented merely because they are documented. Each applicable control must map to code, test, CI, operational evidence or an explicitly recorded future gate.

## Construction state vocabulary
PLANNED = specified only; IMPLEMENTED = code exists; VERIFIED = tests/evidence pass; INTEGRATED = connected to its real boundary; PRODUCTION-READY = operational/regulatory/DR gates pass; LIVE = authorized production activation.

Agents must never collapse these states into a single 'complete' label.

## Executable control registry

The detailed mapping is maintained in docs/security/SECURITY-BIBLE-CONTROL-REGISTRY.md. Every security requirement must map to an implementation boundary and evidence source. The registry is the bridge between the Security Bible and the construction roadmap; it is not a substitute for code or testing.

## Public AI security principles adapted to T.Pay

T.Pay adopts only publicly documented engineering principles, including source-to-sink analysis, limiting agent access, structured outputs, tool risk controls, guardrails, human approval for consequential actions, trace/evaluation, and layered defenses. OpenAI explicitly notes that prompt injection should not be treated as a filtering-only problem and that dangerous actions or sensitive transmissions should not occur silently.

T.Pay therefore implements independent deterministic authorization rather than trusting model refusal. Model safety is one layer; identity, authorization, capability, tool, runtime, network, financial and human-approval boundaries remain independent.

T.Pay does not claim to reproduce private OpenAI or Anthropic system prompts, hidden policies, model weights, proprietary classifiers, confidential detectors or internal operational controls. Vendor-public principles are treated as external design evidence and are translated into T.Pay-owned controls.

## Security problem explicitly rejected

A Super Orchestrator with direct authority over payments, credentials, tenant data, security policy or ledger state would create a high-severity confused-deputy and prompt-injection blast radius. The architecture therefore separates intelligence from authority. The model proposes; deterministic T.Pay policy authorizes; protected domain services execute; Financial Core remains the financial source of truth.

## Security inheritance rule

Any new agent, model, connector, MCP tool, provider, channel or organization module automatically inherits the Security Bible gates. It may not create a parallel authorization path. REST, mobile, USSD, SMS, voice, offline queues, field-agent applications, partner callbacks and AI tools must converge on canonical identity/scope/idempotency/policy boundaries appropriate to their trust level.

## Evidence rule

A security control becomes VERIFIED only after exact-head automated evidence passes. INTEGRATED requires the control to be wired into its real runtime boundary. PRODUCTION-READY additionally requires observability, rollback/recovery, abuse controls and applicable operational/regulatory evidence. LIVE requires explicit activation evidence. A green CI run alone never means LIVE.
