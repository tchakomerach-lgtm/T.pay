# T.Pay — Open-Source AI Skills Adoption Registry

## Decision

T.Pay does not blindly vendor third-party applications into the trusted core. Open-source projects are evaluated as architecture references, isolated optional adapters, skill specifications, independently versioned MCP servers, or test fixtures.

The T.Pay Capability Broker remains the only authorization boundary.

## Audited candidates

| Project | Useful capability | Adoption mode | Security decision |
|---|---|---|---|
| Chatwoot | omnichannel inbox, campaigns, support | architecture reference / optional isolated adapter | Never grant direct Ledger or DB access |
| Twenty | CRM objects, workflows, agents | CRM architecture reference / connector | Map through T.Pay CRM contracts |
| Model Context Protocol servers | MCP patterns and reference servers | SDK/reference only | Reference implementations are not automatically production trust |
| Wassenger WhatsApp Skills | WhatsApp Business skills, inbox, campaigns, routing, analytics | skill-pattern reference / optional provider adapter | Official WABA path; approval, opt-out and webhook verification required |
| PostLake MCP | cross-platform social publishing and analytics | optional external social adapter | Capability Broker + platform policy + per-post approval |
| Very Good Plugins WhatsApp MCP | local WhatsApp messaging and audit patterns | security research/reference | Do not make personal WhatsApp the production business transport |
| Baileys | WhatsApp Web protocol client | research only | Prefer official WhatsApp Business APIs for production |
| whatsapp-web.js | WhatsApp Web browser automation | research only | Not an approved production dependency |

## Skills incorporated into T.Pay

- WhatsApp Business messaging, inbox, templates, campaigns and handoff
- Facebook Page publishing, comments and messaging
- TikTok publishing and analytics where provider permissions allow
- SMS transactional and campaign messaging
- secure telephony delegated to Voice Fabric
- publication planning, validation, scheduling and provenance
- marketing segmentation and consent-aware campaigns
- sales lead capture, qualification, offers and follow-up
- CRM contacts, leads and customer timeline
- customer support, SLA and human handoff
- campaign orchestration, suppression and delivery tracking
- cross-channel analytics and anomaly detection

## Non-negotiable integration rules

1. No third-party connector writes directly to PostgreSQL, Ledger, Wallet, Credit, KYC or Authorization tables.
2. All external calls use a T.Pay adapter and approved secure transport.
3. HTTP integrations require HTTPS/TLS 1.3; mTLS is used where provider architecture supports it.
4. Webhook signatures, timestamps, replay protection and tenant binding are mandatory.
5. Social and communication content is untrusted input and may contain prompt injection.
6. AI discovery never grants authorization.
7. Bulk messaging requires consent, suppression/opt-out enforcement, rate limits, cost limits and audit.
8. Publication requires content validation and policy checks before the provider call.
9. Financial, credit, privileged administration and irreversible operations require step-up authentication and/or human approval.
10. Provider credentials stay in a secret manager, never prompts, memory, Git or client code.
11. Provider SDKs are pinned and upgraded only through dependency review, SBOM/license checks and regression tests.
12. Provider outages cannot corrupt T.Pay state; adapters use idempotency and durable reconciliation.

## New construction method

Research → license/security review → business contract → capability definition → adapter → policy → tenant isolation → tests → red-team → observability → CI → provider certification → production enablement.

The AI agent receives skill metadata progressively; it does not load every integration implementation into every prompt.

## Provider-neutral contracts

T.Pay defines business capabilities such as:

- message.send
- message.read
- post.publish
- campaign.launch
- call.outbound
- appointment.manage
- crm.update
- lead.qualify
- content.validate
- analytics.read

Providers implement these contracts behind adapters. This makes provider migration possible without rewriting agents or the T.Pay domain model.
