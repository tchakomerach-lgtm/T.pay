# ADR-025 — T.Pay AI Core and Multi-Provider Orchestration

## Decision
T.Pay uses one AI Core as the central orchestration plane. Specialist agents (commercial growth, security, finance, education, microfinance, health, agriculture, organization operations, etc.) implement bounded missions and use the AI Core provider registry for inference.

## Provider boundary
OpenAI Responses and Anthropic Messages are concrete adapters. Future providers implement the same provider contract. Vendor-specific SDKs and payloads stay inside adapters.

## Safety boundary
The model is never the authority for authorization, consent, financial settlement or irreversible state. Server-side policy and domain services remain authoritative. AI tool access is deny-by-default.

## Routing
Provider choice can consider tenant policy, data classification, jurisdiction/data residency, capability/model requirement, health/circuit state, latency budget and cost budget. Fallback is forbidden when it would violate data, residency or contractual constraints.

## Commercial Growth
The commercial-growth specialist is part of the AI Core. It discovers/ranks opportunities and prepares actions. Actual publication/contact requires the existing commercial authorization, consent and quota gates. A sale enters the existing Payment Intent and Financial Core; the agent cannot create or mutate ledger entries.

## Togo/Africa optimization
The runtime must support low-bandwidth operation, asynchronous queues, cached deterministic policy decisions, local-language templates, SMS/USSD-compatible workflows and cost-aware model routing.
