# T.Pay AI Runtime Containment Contract

This layer adapts public agent-security lessons from OpenAI and Anthropic into T.Pay-owned controls. It does not copy private prompts, weights, classifiers or confidential implementation.

## Threat model

A model can be manipulated by hostile content from documents, web pages, email, RAG, MCP/connector output, partner APIs or another agent. Model-level refusal is probabilistic and is never the final authorization boundary.

## Four independent containment planes

### 1. Model plane
- system/developer policy hierarchy;
- input/output safety checks;
- adversarial evaluation;
- prompt-injection probes;
- model/provider diversity.

### 2. Tool/harness plane
- typed action envelopes;
- deny-by-default tools;
- per-tool risk;
- scoped capability;
- deterministic policy gate on every consequential call;
- approval bound to canonical payload;
- no privilege transfer through agent messages.

### 3. Environment plane
- sandbox execution for untrusted code/data transformations;
- filesystem allowlists;
- credentials absent from model sandbox;
- network egress deny-by-default;
- destination allowlists through an external policy proxy;
- separate control-plane credentials from workload credentials.

### 4. External-content plane
- treat tool results as untrusted DATA;
- provenance and trust metadata;
- quarantine suspicious content;
- never let retrieved instructions change policy;
- strip irrelevant external content from security decisions where possible;
- post-tool output inspection before sensitive content returns to the model.

## T.Pay design rule

The security decision must be made from the canonical user intent + structured action + identity + tenant + capability + destination + risk, not from persuasive model text or hostile tool output.

For a consequential action:

UNTRUSTED INPUT → MODEL PROPOSAL → STRUCTURED ACTION → POLICY GATE → APPROVAL/AUTHORIZATION → SANDBOX/EGRESS GATE → TOOL → EVIDENCE → AUDIT

A failure at any gate fails closed.

## African operational adaptation

- Partner callbacks are untrusted evidence until signature, idempotency and transaction binding pass.
- USSD/SMS/voice commands are untrusted ingress and cannot bypass the same policy gate.
- Offline clients may queue evidence/intents, never authorization.
- Field-agent devices receive short-lived scoped credentials and cannot hold root payment keys.
- Low-bandwidth fallback must preserve authorization and replay protections rather than downgrade them.

## Required future implementation gates

1. Runtime sandbox adapter.
2. Egress policy proxy.
3. Credential non-exposure boundary.
4. Tool-call security monitor.
5. Input prompt-injection probe.
6. Post-tool result quarantine.
7. OpenTelemetry-compatible privacy-minimized traces.
8. Adversarial corpus with repeated adaptive attempts.
9. Canary/kill-switch drills.
10. Production evidence and rollback.

## Source inspiration

Public Anthropic engineering material emphasizes containment through filesystem/network isolation and independent safeguards around the model; public OpenAI guidance emphasizes source-to-sink analysis, structured outputs, tool approvals and layered defenses. T.Pay uses these as design inspiration, not as a claim of private vendor implementation.
