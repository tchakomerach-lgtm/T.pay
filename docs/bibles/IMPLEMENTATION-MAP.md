# T.Pay Bible Implementation Map

Les Bibles générale, Design, Sécurité, AI, Microfinance, Éducation, Investissement, Organisation et Finance sont implémentées progressivement par domaines, invariants, tests et interfaces.

Ordre: Foundation → Identity/Org → Security → Ledger → Wallet/Payments → Social/Opportunity/Marketplace → Microfinance/Education/Investment → AI Core → Integrations → Observability → Hardening → Production.

## Gain / payout delivery status
- GAIN-007/008 are the product-level revenue and treasury contracts from the conversation; verify repository implementation before claiming feature completion.
- GAIN-009 contract: `docs/bibles/TPAY-BIBLE-GAIN-009-AUTOMATIC-PAYOUT-SETTLEMENT.md`.
- First deterministic preflight implementation: `packages/finance/src/payout-guardrails.ts`, covered by `tests/payout-guardrails.test.ts`.
- This is a policy preflight only. Durable reservation/limits under concurrent PostgreSQL transactions, unknown provider outcome recovery, production provider certification and compliance gates remain open.

Avant chaque nouveau lot: rechercher l'existant, réutiliser les invariants, éviter toute duplication.
