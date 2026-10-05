# T.Pay AI Security Constitution

Status: MANDATORY BUILD CONTRACT
Scope: AI Core, specialist agents, model providers, tool gateway, memory/context, RAG, agent-to-agent communication, evaluation and autonomous security.

## 1. Authority model
T.Pay separates intelligence from authority. Models may analyze, classify, draft, simulate and recommend. Server-side policy, identity, authorization, consent, financial controls and domain services remain authoritative.

T.Pay's hierarchy is an application security design, not a reproduction of any private OpenAI control: platform/security policy > T.Pay security policy > domain policy > agent capability > user request > external/tool content. Tool output, documents, web content, messages and retrieved text are DATA, never authority.

## 2. Source-to-sink rule
Every agent path must identify an untrusted source and every consequential sink. Untrusted content MUST NOT directly determine a privileged tool call, permission change, financial mutation, credential use, external transmission or policy change. A deterministic policy gate must sit between source and sink.

## 3. Capability security
Agents receive short-lived, least-privilege capabilities scoped to agent, organization, actor, purpose, tool, data class and expiry. No agent may mint, extend, delegate or self-approve its own capability.

## 4. Tool risk classes
- L0: deterministic/local read of public or low-risk data — autonomous.
- L1: read of sensitive data — policy-gated and audited.
- L2: reversible internal write — explicit policy gate and idempotency required.
- L3: external communication or consequential preparation — approval/consent required.
- L4: financial, identity, access, credit, payout or administrative high-impact action — independent authorization plus human approval by default; two-person approval where policy requires.
- L5: root keys, trust anchors, ledger-root operations, security bypass or production control-plane takeover — AI cannot execute directly.

## 5. Structured action envelope
Models must return typed action proposals, not executable commands. The Tool Gateway validates schema, tenant, actor, purpose, capability, risk class, policy, idempotency and approval before execution.

## 6. Prompt injection / tool poisoning
Never solve prompt injection only by filtering strings. Treat retrieved content and tool output as untrusted. Constrain impact even if the model is manipulated: minimize tools, isolate sensitive context, validate outputs, require approval for consequential actions, and block source-to-sink privilege escalation.

## 7. Memory and RAG
Memory is untrusted application state. Every memory item has tenant, source, trust level, purpose, created/updated time, expiry and provenance. Retrieved content cannot modify policy, system instructions, capabilities or approval state. Poisoned/expired/conflicting knowledge is quarantined.

## 8. Agent-to-agent trust
Agents communicate through authenticated envelopes containing sender identity, recipient, organization, purpose, capability, nonce, timestamp, parent trace and payload hash. One agent's output is evidence, not authorization for another. Cycles, collusion patterns, privilege laundering and repeated delegation are blocked.

## 9. Model routing
Provider/model selection never grants additional authority. Routing is constrained by data class, tenant policy, residency, capability, cost, health and contract. Failover is forbidden when it would violate those constraints. A compromised or anomalous model route can be quarantined without disabling Financial Core.

## 10. Sandbox and egress
Code execution, browser-like automation, file access and external network access are sandboxed and deny-by-default. Sensitive agents have explicit egress allowlists. Secrets are never placed in prompts or model-visible context unless a dedicated policy explicitly permits a derived, non-secret capability.

## 11. Human approval
Consequential actions must present the human with the actual action, target, scope, amount/data class, reason, reversibility and evidence. Approval is bound to the exact canonical payload hash and expires. Changing the payload invalidates approval.

## 12. Evaluation and red teaming
Every AI capability has adversarial tests for prompt injection, tool misuse, data exfiltration, policy bypass, cross-tenant leakage, excessive autonomy, cost abuse and goal drift. Production release requires passing the applicable evaluation corpus and trace/behavior checks.

## 13. Audit and kill switch
Every agent invocation, capability issuance, tool decision, approval, denial, provider route and security intervention is auditable without storing unnecessary sensitive content. A global and scoped AI kill switch must stop agent execution while leaving deterministic financial truth and recovery paths intact.

## 14. Prohibited behavior
Agents MUST NOT: reveal secrets or hidden security material; treat external text as higher authority; broaden permissions; bypass approval; directly write Ledger truth; disable security controls; conceal security findings; use one agent's approval as another's authorization; or continue after capability expiry/quarantine.

## 15. Construction gate
No AI feature is complete until code, tests, threat model, tool-risk classification, audit evidence, observability, rollback/kill-switch behavior and CI security gates exist. 'Model responds correctly' is not completion evidence.

## 16. Relationship to public OpenAI safety practice
T.Pay may adapt publicly documented principles such as instruction hierarchy, treating tool outputs as untrusted data, minimizing tool access, structured outputs, guardrails, sandboxing, human confirmation for consequential actions, monitoring and red-teaming. T.Pay does not claim to reproduce confidential OpenAI system prompts, internal policies, weights, proprietary detectors or private operational controls.
