# T.Pay Bible Implementation Map

Les Bibles générale, Design, Sécurité, AI, Microfinance, Éducation, Investissement, Organisation et Finance sont implémentées progressivement par domaines, invariants, tests et interfaces.

Ordre: Foundation → Identity/Org → Security → Ledger → Wallet/Payments → Social/Opportunity/Marketplace → Microfinance/Education/Investment → AI Core → Integrations → Observability → Hardening → Production.

## Gain / payout delivery status
- GAIN-009 contract: `docs/bibles/TPAY-BIBLE-GAIN-009-AUTOMATIC-PAYOUT-SETTLEMENT.md`.
- Deterministic preflight policy: `packages/finance/src/payout-guardrails.ts`, with targeted tests in `tests/payout-guardrails.test.ts`.
- This is a preflight policy only. Durable PostgreSQL reservation, concurrent daily-limit enforcement, provider unknown-outcome recovery, reconciliation and provider certification remain open.

Avant chaque nouveau lot: rechercher l'existant, réutiliser les invariants, éviter toute duplication.