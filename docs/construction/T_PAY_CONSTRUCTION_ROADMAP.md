# T.Pay Construction Roadmap — Security-First Execution

This roadmap is the durable sequencing contract for T.Pay. It is not a claim that the platform is complete.

## State machine

- PLANNED: architecture/rules defined; no implementation evidence.
- IMPLEMENTED: code exists.
- VERIFIED: applicable automated tests and exact-head CI are green.
- INTEGRATED: connected to real application boundaries and dependent layers.
- PRODUCTION-READY: operational, migration, observability, recovery, security and regulatory gates satisfied.
- LIVE: intentionally activated in an approved environment.

No state may be skipped.

## Execution sequence

### Gate A — Construction constitution
Status: IMPLEMENTED; VERIFY/INTEGRATE through PR #66 and exact-head CI.
- Security Bible registry
- AI security constitution
- TASS contract
- build rules/skills
- no-false-completion state vocabulary

### Gate B — AI control plane
Current sequence:
1. Structured action envelope.
2. Risk-bounded capability issuance.
3. Deterministic policy gate.
4. Tool Gateway integration.
5. Human approval service bound to canonical payload.
6. Global/scoped AI kill switch.
7. Agent-to-agent authenticated envelope.
8. Memory/RAG trust and quarantine.
9. Provider routing and data-residency enforcement.
10. Runtime timeout/circuit/cost controls.

### Gate C — Financial Core
- Immutable double-entry Ledger.
- Payment, Credit, Commission and Subsidy engines.
- Intent → policy → command → ledger settlement.
- Idempotency, replay, concurrency and reconciliation proofs.
- Mobile-money, cash and partner adapters.
- No AI direct ledger mutation.

### Gate D — Identity and organization platform
- Identity/KYC/device/session.
- Organization tenancy and role/permission model.
- Public page/member portal.
- Document and communications boundaries.
- Organization-scoped AI assistants.

### Gate E — African connectivity fabric
- REST/mobile/agent/USSD/SMS/voice canonical ingress.
- Offline evidence queue and deterministic reconciliation.
- Shared-device safeguards.
- Low-bandwidth UX and bounded payloads.
- Mobile-money confirmation/reconciliation.
- Field-agent continuity without dependence on one agent device.

### Gate F — Microfinance/tontine
- Client/agent/supervisor/agency/SFD hierarchy.
- Savings/collection/credit/recovery.
- Daily tontine and community tontine.
- e-carnet and migration adapters.
- Human approval for high-impact credit/payment actions.
- Partner/regulatory activation gates.

### Gate G — Education and subsidy
- School ERP and academic records.
- Parent/student/staff portals.
- Tuition/supplies subsidy intents.
- MFI guarantor/recovery workflow.
- AI education assistant with data isolation.

### Gate H — Social/opportunity/marketplace
- Feed/social graph/messaging.
- Recruitment/opportunity.
- Marketplace/merchant tools.
- Advertising/deep links.
- Anti-fraud and abuse controls.

### Gate I — Vertical organization modules
Health, agriculture, transport, hospitality, retail, professional services, public administration and other organization types use shared tenant, identity, finance, communications, AI and security primitives rather than duplicating security logic.

### Gate J — Platform operations
- TASS + adversarial evals.
- SBOM/provenance/dependency controls.
- Backups/restore/DR/BCP.
- Incident response/forensics.
- SLOs, privacy-minimized observability and cost controls.
- Progressive rollout/canary/rollback.
- Production partner and regulatory evidence.

## Continuous African-fit requirements

Every relevant layer must be tested against:
- intermittent network and delayed delivery;
- low-end Android and constrained storage/battery;
- cash/mobile-money mixed operations;
- USSD/SMS/voice fallback;
- shared phones and agent devices;
- multilingual UX;
- fraud/social-engineering pressure;
- ambiguous partner callbacks;
- operational realities of field collection.

## Completion gate

T.Pay is not declared complete until every applicable Gate is at least PRODUCTION-READY, regulated capabilities have their external activation evidence, and LIVE is separately documented for each environment. A model, coding session, vendor or conversation cannot declare completion.
