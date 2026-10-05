# T.Pay Security Construction Contract

## Purpose
This contract makes the Security Bible an executable construction constraint for every T.Pay layer: core services, web/mobile clients, organization modules, Financial Core, AI, connectors, partner integrations, offline/field channels and infrastructure.

It does not copy private OpenAI or other vendor controls. It adapts publicly documented defensive principles and adds T.Pay-owned controls appropriate to a multi-tenant fintech platform.

## Non-negotiable security model
UNTRUSTED INPUT -> MODEL/PROPOSAL -> TYPED ACTION -> DETERMINISTIC POLICY -> AUTHORIZATION/APPROVAL -> CONTAINED EXECUTION -> EVIDENCE -> AUDIT.

No model, agent, connector, retrieved document, webhook, client, offline queue, field device or provider response can become an authority merely by claiming success or producing persuasive text.

## Authority hierarchy
1. T.Pay security and platform policy.
2. Domain policy and regulatory/partner constraints.
3. Server-side identity, tenant and authorization state.
4. Short-lived capability issued by deterministic policy.
5. Human approval where required.
6. User request, only within already-authorized scope.
7. Model/tool/RAG/partner/external content as data/evidence.

Lower layers cannot override higher layers.

## Security construction gates
| Gate | Scope | Mandatory controls | Minimum evidence |
|---|---|---|---|
| SG-0 | Construction governance | Bible mapping, threat model, state ledger, hard stops | mapping + review |
| SG-1 | Identity/tenant | authentication, device/session binding, RBAC/ABAC, tenant isolation | negative tests |
| SG-2 | API/channel ingress | canonical envelopes, idempotency, replay protection, rate limits | contract/concurrency tests |
| SG-3 | AI control plane | action envelopes, capability issuance, policy gate, approval binding | AI security tests |
| SG-4 | Runtime containment | sandbox, credential non-exposure, filesystem boundary, egress policy | containment tests |
| SG-5 | External content | provenance, quarantine, prompt-injection defenses, post-tool inspection | adversarial corpus |
| SG-6 | Financial Core | immutable double-entry ledger, command boundaries, settlement/reconciliation | invariant/race/replay tests |
| SG-7 | Payment/credit | provider evidence, authorization, idempotency, risk controls, human gates | provider/simulation evidence |
| SG-8 | African connectivity | offline evidence, secure sync, USSD/SMS/voice, field-agent controls | replay/conflict/field tests |
| SG-9 | Privacy/secrets | classification, minimization, retention, secret isolation, crypto/key boundaries | scans + privacy tests |
| SG-10 | Observability/IR | tamper-evident evidence, alerts, incident response, recovery | drill evidence |
| SG-11 | Supply chain | SBOM/provenance, dependency/secret scanning, CI least privilege | CI artifacts |
| SG-12 | TASS/adversarial | safe scanning, adaptive red-team, regression corpus, release blocking | TASS/eval evidence |
| SG-13 | Regulatory activation | partner/license/operational evidence before regulated activation | activation record |
| SG-14 | Production readiness | DR/BCP, restore, rollback, canary, kill switch, runbooks | readiness review |
| SG-15 | Live operation | explicit authorized activation and continuous monitoring | LIVE evidence |

A feature cannot skip a gate because its implementation is small, AI-generated, internal-only, or protected by a prompt.

## AI-specific construction constitution
### Intelligence is not authority
AI may classify, summarize, recommend, draft, detect, explain and propose. It does not independently authorize money movement, credit approval, privileged access, security-policy changes, root-key operations or irreversible administrative state.

### Source-to-sink security
Every consequential path must be traceable from source to execution sink. The threat model must identify whether data can influence tool selection, action parameters, destination, credentials, tenant scope, approval state, financial amount or security policy. Such paths cross deterministic validation before execution.

### Structured action only
Free-form text is never executable. Consequential actions use versioned schemas containing action ID/version, tenant, actor, agent, purpose, tool/version, risk, canonical payload hash, correlation ID, expiry, capability reference and approval reference where required.

### Capability discipline
Capabilities are deny-by-default, least-privilege, short-lived, non-delegable and bound to tenant/actor/agent/purpose/tool/data class. They are issued only by server-side deterministic policy. L5/root capability issuance is forbidden.

### Independent approval
Approval binds to the exact canonical payload and security context. A changed amount, destination, tenant, purpose, scope or payload invalidates approval.

### Runtime containment
Model-level safety is not the final boundary. Sensitive execution also requires sandboxed process/filesystem access, no raw credentials in model context, a secret broker, deny-by-default egress, destination/data-class policy, bounded resources, a kill switch and evidence capture.

### External content
Web pages, email, SMS, RAG, documents, MCP/tool results, partner messages and other retrieved content are untrusted data. They cannot issue policy, grant capability, approve an action or change security rules.

### Agent mesh
Agent-to-agent messages are authenticated evidence. They cannot transfer privilege, approval or capability. Every consequential sink re-authorizes independently.

### Model/vendor neutrality
Changing OpenAI, another provider, a local model or routing strategy cannot change authorization, data residency, tool scope or risk class.

## T.Pay security controls beyond model safety
- confused-deputy prevention;
- dual authorization for high-impact financial/security actions;
- immutable financial truth;
- independent security monitor;
- capability TTL and revocation;
- tenant-bound action hashes;
- replay and sequence protection;
- offline quarantine;
- provider callback verification;
- partner evidence binding;
- adaptive abuse controls;
- Denial-of-Wallet protection;
- cost and token budgets;
- canary credentials/data;
- kill switches;
- TASS release gates;
- recovery drills;
- evidence preservation;
- security exception expiry;
- construction-state integrity.

## Togo/Africa construction requirements
Every applicable feature must test intermittent 2G/3G/4G connectivity, low-end Android devices, shared-device risks, mobile-money delays/duplicates, cash collection and field-agent loss/theft scenarios, USSD/SMS/voice ambiguity, offline replay/conflict, multilingual ambiguity, partner outages and low-bandwidth payload limits.

Offline availability must never weaken authorization. Regulated payment/e-money/credit activation remains disabled until applicable licensed-partner and operational evidence exists.

## Security state machine
PLANNED -> IMPLEMENTED -> VERIFIED -> INTEGRATED -> PRODUCTION-READY -> LIVE

IMPLEMENTED requires code/configuration. VERIFIED requires deterministic automated evidence. INTEGRATED requires the real runtime boundary. PRODUCTION-READY requires recovery, observability, abuse controls and operational/regulatory evidence. LIVE requires explicit activation evidence.

No model confidence, chat message, issue label or documentation sentence can advance a state.

## Mandatory construction sequence
DISCOVER -> BIBLE-MAP -> THREAT-GATE -> DESIGN -> IMPLEMENT -> TEST -> SECURITY REVIEW -> OBSERVE -> COST REVIEW -> TASS/EVAL -> CI -> RECORD -> NEXT-GATE

Every sequence records exact head SHA, changed controls, tests/evidence, residual risk, rollback/recovery and next gate.

## Hard stops
Stop and require independent human approval for secrets/credentials, root trust or cryptographic trust anchors, Financial Core invariants, authorization/tenant-boundary changes, destructive migrations, regulated activation, new external egress, cross-tenant data flow, security-policy changes, AI capability escalation, production destructive actions and unresolved critical security findings.

## Completion rule
T.Pay is never declared globally complete from a single green build. Completion is a matrix of verified layers, integration evidence, production-readiness evidence and explicit LIVE activation where authorized.
