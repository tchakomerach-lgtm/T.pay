# T.Pay Investor Prototype

This is a browser-only, interactive investor demonstration of T.Pay OS. It is deliberately isolated from the production API and does not connect to payment providers, credit systems, customer records, identity services or the production ledger.

## Run

From the repository root:

- `npm install`
- `npm run investor:dev`
- Open the local Vite URL shown in the terminal.

Build the static production bundle:

- `npm run investor:build`

The app stores fictional demonstration records in browser `localStorage`. Use **Réinitialiser la démo** to restore the seed dataset.

## Included interactive areas

Home, organizations, School OS, School Subsidy, microfinance, community tontine, Financial Core, wallet, marketplace, Opportunity & Work, social, Investment Core, AI Core, documents, workflows/projects, calendar/reservations, Super Admin governance, and preview cards for agriculture, transport, health, hospitality and public services.

Interactive examples include organization creation, student/client creation, social posts, tasks, School Subsidy request capture, simulated payment intents, tontine group creation, marketplace orders, opportunity publication, document templates, resource reservations and investment scenarios.

## Safety and fidelity

- All data is fictional and local to the browser.
- Financial actions are explicitly simulated; no funds move.
- No real KYC, credit decision, investment order, guarantee or provider call occurs.
- AI actions are prepared for demonstration and cannot mutate financial state.
- This prototype is not an authentication, authorization, RLS, ledger or payment certification.
- Production APIs and services must be connected through the existing T.Pay domain boundaries, not by embedding provider calls in the frontend.

## Senior engineering handover

Treat this application as an experience prototype and product acceptance surface. Replace local demo adapters with typed API clients incrementally. Keep domain ownership in backend services, enforce tenant/organization authorization server-side, and preserve the existing Financial Core, idempotency, audit, Outbox, temporal permission, offline and provider-adapter invariants. Do not reuse fictional seed data in production.

The global design baseline is `docs/bibles/TPAY-DESIGN-BIBLE-IMPLEMENTATION.md`; the construction loop is `docs/skills/TPAY-CONSTRUCTION-001.md`; mandatory domain routing is `docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md`.

## Community Tontine command center — visual scope

The Community Tontine surface now includes a responsive command-center composition:
- community metrics and a fictional contribution progress visualization;
- a five-stage cycle status from collection through Financial Core verification and human approval;
- a community directory with frequency, member count, next beneficiary and illustrative status;
- governance surfaces for member votes, partner attestations, deterministic rotation, audit and replay protection;
- an explicit separation between daily school-supply recovery tontine and independent community tontine.

The 3D motion layer is intentionally restrained and honors `prefers-reduced-motion`. It is currently a visual prototype in this investor app, not the canonical DB-074 Web/Mobile renderer. Do not treat the demo's sample amounts, groups, progress bars or client-side interactions as production data or authorization. The production UI must consume authenticated APIs and the shared DB-074 design contract before being enabled for real users.

