# T.Pay Construction Roadmap

## Authority
This roadmap is subordinate to the T.Pay Security Construction Contract, BUILD-RULES.md, Security Bible Control Registry and domain Bibles. It is the durable sequence for construction and must be updated whenever a gate changes.

## Gate A — Construction Constitution
AGENTS operating rules; Bible consultation registry; security control registry; construction-state ledger; exact-head/CI evidence; hard-stop and independent-review protocol.

## Gate B — AI Control Plane
Canonical action envelopes; deterministic capability issuance; policy gate; approval binding; tool risk registry; cross-agent authorization; provider/model neutrality; kill switch; runtime containment; egress control; credential non-exposure; external-content quarantine; memory/RAG provenance and poisoning defense; adversarial evaluation.

## Gate C — Identity and Organization Trust
Authentication/session/device binding; organization access isolation; RBAC + ABAC + purpose/context policy; privileged access controls; tenant isolation; privacy/data classification; audit and revocation.

## Gate D — Financial Core
Immutable double-entry Ledger; transaction commands; wallet/account boundaries; idempotency and concurrency; reconciliation; outbox/event integrity; financial intent model; rollback/compensation semantics without mutating history.

## Gate E — Payment and Provider Fabric
Provider adapters; mobile-money callback verification; partner evidence; settlement/reconciliation; timeout/circuit-breaker behavior; duplicate/replay protection; provider credential isolation; regulated activation gates.

## Gate F — African Connectivity and Field Fabric
Offline evidence queues; sequence/replay protection; secure sync/reconciliation; USSD/SMS/voice ingress; field-agent device/session/cash controls; low-bandwidth UX; shared-device protection; degraded-mode safety.

## Gate G — Microfinance and Tontine
Client/agent/supervisor/agency/SFD boundaries; savings/deposits/withdrawals; tontine collections; loan/credit workflows; recovery; commissions; e-carnet evidence; location/evidence policy; cash/mobile-money reconciliation; human approval for high-impact decisions.

## Gate H — Education and Subsidy
School/university organizations; classes/students/parents/staff; fees and supplies; microfinance-backed subsidy; contribution/recovery flows; bulletins/documents; AI education assistant; academic data privacy.

## Gate I — Social, Opportunity and Marketplace
Home feed/social graph; opportunity/recruitment; marketplace/e-commerce; advertising/deep links; messaging/content moderation; payments through Financial Core only; anti-fraud/anti-abuse.

## Gate J — Organization Vertical Modules
Enterprise/PME/PMI/startup; restaurant/hotel/boutique/supermarket; clinic/hospital/pharmacy/laboratory; farm/agriculture/cooperative; NGO/association/public administration; transport; real estate; industry/media/sport/culture; other. Each vertical inherits the same security contract and cannot create a parallel authorization or financial truth.

## Gate K — Platform Operations
Observability; SIEM/SOC/SOAR integration; incident response; backups/restore; DR/BCP; TASS; chaos/canary; supply-chain security; dependency and secret scanning; vulnerability/exception lifecycle; security drills; cost controls; production runbooks.

## Gate L — Regulated Activation and LIVE
For each regulated capability: technical readiness; security evidence; operational controls; partner/license/regulatory evidence; human approval; controlled activation; monitoring and rollback. LIVE is per capability, not a global project status.

## Construction state ledger
Each gate records gate ID, state (PLANNED/IMPLEMENTED/VERIFIED/INTEGRATED/PRODUCTION-READY/LIVE), exact head SHA, Security Bible IDs, exact test/eval names, exact CI workflow/run, residual risk, rollback, next gate and activation evidence when LIVE.

## Security inheritance
Every new agent, model, connector, MCP tool, channel, organization module, provider or workflow automatically inherits tenant isolation, identity/authorization, source-to-sink analysis, action envelopes, capability policy, tool risk classification, approval binding, runtime containment, external-content quarantine, audit, kill switch, TASS/evaluation, privacy/retention and supply-chain controls. A new component may add restrictions but cannot weaken inherited restrictions.

## Mandatory final gate
The project is not globally complete until every applicable Gate A-K is at least PRODUCTION-READY and each regulated capability intended for LIVE has its own activation evidence. LIVE must never be inferred from CI.
