# T.Pay Security Bible Control Registry

This registry converts the Security Bible into implementation gates. A control is not considered complete because documentation exists; its state requires code, tests, integration evidence and operational evidence appropriate to the layer.

## Control families

| ID | Family | Mandatory implementation rule | Evidence |
|---|---|---|---|
| SB-01 | Identity | Strong identity, session/device binding and phishing-resistant privileged authentication | tests + security review |
| SB-02 | Tenant isolation | Every read/write/tool path carries verified organization scope | isolation tests |
| SB-03 | Authorization | RBAC + ABAC + purpose + context + least privilege | policy tests |
| SB-04 | AI authority | Model output is never authorization | action/policy tests |
| SB-05 | Source→sink | Untrusted data cannot directly reach consequential sinks | taint/path tests |
| SB-06 | Capabilities | Short-lived, scoped, non-delegable capabilities | capability tests |
| SB-07 | Tool security | Risk-rated tools, deterministic pre-sink gate, approval where required | tool tests |
| SB-08 | Human approval | Approval binds exact canonical payload, actor, scope, expiry and purpose | approval tests |
| SB-09 | L5/root | AI cannot execute root-key, trust-anchor, ledger-root or security-bypass actions | negative tests |
| SB-10 | Kill switch | AI execution fails closed while financial truth remains untouched | drill + tests |
| SB-11 | External content | Web/RAG/MCP/SMS/email/partner output is DATA, never policy | injection tests |
| SB-12 | RAG/memory | Provenance, trust, purpose, expiry, tenant isolation and quarantine | poisoning tests |
| SB-13 | Agent mesh | Agent messages authenticate identity but never transfer authority | delegation tests |
| SB-14 | Model routing | Provider/model choice cannot grant privilege or bypass data policy | routing tests |
| SB-15 | Runtime containment | Sandbox, filesystem boundary, credential isolation and egress policy | sandbox tests |
| SB-16 | Financial core | Ledger is immutable double-entry truth; AI cannot write it directly | invariant/replay tests |
| SB-17 | Payments | Intent, authorization, idempotency, settlement and reconciliation are deterministic | concurrency tests |
| SB-18 | Credit | Credit decisions remain policy/authorization controlled; AI is advisory unless explicitly bounded | decision tests |
| SB-19 | Mobile money | Provider callbacks are signed/bound/idempotent evidence before financial effects | webhook tests |
| SB-20 | Offline | Offline clients hold evidence/intents, not authorization; ambiguous events quarantine | sync tests |
| SB-21 | USSD/SMS/voice | Low-trust channels converge on canonical identity, intent and policy gates | channel tests |
| SB-22 | Field agents | Device/session/cash collection risk controls and short-lived credentials | field tests |
| SB-23 | Privacy | Data minimization, classification, retention and redaction are enforced server-side | privacy tests |
| SB-24 | Secrets/crypto | Secrets never enter model context; KMS/HSM boundaries and rotation remain external to agents | secret scans |
| SB-25 | Supply chain | SBOM, dependency scanning, provenance and signed/reviewed changes | CI evidence |
| SB-26 | Abuse | Rate, velocity, automation, cost and Denial-of-Wallet controls | abuse tests |
| SB-27 | Observability | Security decisions produce privacy-minimized tamper-evident evidence | trace tests |
| SB-28 | Incident response | Detection, containment, evidence preservation, rollback and recovery are rehearsed | drill evidence |
| SB-29 | TASS | Security scanner is least-privileged, non-self-authorizing and release-gating | scanner/eval evidence |
| SB-30 | Adversarial eval | Prompt injection, jailbreak, tool misuse, RAG poisoning and adaptive attacks are continuously evaluated | eval corpus |
| SB-31 | Governance | High-impact/regulated features require explicit activation evidence | activation records |
| SB-32 | Construction integrity | Session/token/provider failure never counts as construction; commits + CI are authoritative | Git evidence |

## Mandatory AI defense stack

1. **Model-level safety:** robust instructions, safety training/model choice and adversarial evaluation.
2. **Structured interface:** typed outputs and action schemas; free-form model text cannot become a command.
3. **Guardrails:** deterministic input/output/tool checks and data classification.
4. **Capability boundary:** least privilege, bounded TTL and tenant/actor/tool/purpose scope.
5. **Approval boundary:** human/policy approval for consequential actions, bound to exact payload.
6. **Runtime containment:** sandbox, filesystem/network restrictions and secret isolation.
7. **External-content boundary:** retrieved content is untrusted data; provenance and quarantine.
8. **Audit/evaluation:** traces, security events, regression corpus, red-team and release gates.
9. **Kill switch:** fail-closed shutdown of AI execution.
10. **Financial boundary:** AI cannot directly mutate ledger, settle money or alter security roots.

## Togo/Africa-specific mandatory controls

- intermittent connectivity must not weaken authorization;
- offline queues must use replay protection, ordering and reconciliation;
- mobile-money callbacks must be cryptographically/provider validated and idempotent;
- cash operations must preserve dual-control/agent accountability where required;
- shared devices must not inherit another person's privileged session;
- USSD/SMS/voice are convenience channels, never trust anchors;
- low-end devices receive minimal data and bounded payloads;
- multilingual/user-interface ambiguity must not alter authorization semantics;
- regulated payment/e-money/credit activation remains disabled until the applicable licensed-partner and operational controls are evidenced.

## Prohibited shortcuts

- “The model refused” is not a security control.
- “The prompt says not to do it” is not authorization.
- “The user probably intended it” is not authorization.
- “The RAG source is trusted” does not make its instructions trusted.
- “The provider callback says success” does not settle a transaction by itself.
- “Offline data came from our app” does not make it authoritative.
- “A security agent approved it” does not replace independent authorization.
- “CI passed once” does not establish production readiness.

## Completion rule

For every control, record state and evidence. No control may be marked LIVE without a verified implementation, integration, observability, rollback/recovery and—where regulated—external activation evidence.


## Construction-gate mapping
SB-01..SB-03 -> SG-1 Identity/tenant.
SB-04..SB-15 -> SG-3/SG-4/SG-5 AI, containment and external-content gates.
SB-16..SB-20 -> SG-6/SG-7 Financial Core and provider/payment gates.
SB-21..SB-23 -> SG-8/SG-9 channel and privacy gates.
SB-24..SB-26 -> SG-9/SG-11 secrets, supply chain and abuse gates.
SB-27..SB-30 -> SG-10/SG-12 observability, incident response, TASS and adversarial evaluation.
SB-31..SB-32 -> SG-13/SG-14/SG-15 governance, production readiness and activation.

This mapping is many-to-many in implementation: a runtime boundary may satisfy several controls, and one control may require several layers. It never permits a bypass.

## Minimum inherited security declaration
Before integration, each new component must document its trust boundary, tenant scope, data classes, capabilities, tools, egress, approval level, audit events, kill-switch scope and recovery behavior. Missing security metadata is an integration blocker.
