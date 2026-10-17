# T.Pay Bible Implementation Map

Les Bibles générale, Design, Sécurité, AI, Microfinance, Éducation, Investissement, Organisation et Finance sont implémentées progressivement par domaines, invariants, tests et interfaces.

Ordre: Foundation → Identity/Org → Security → Ledger → Wallet/Payments → Social/Opportunity/Marketplace → Microfinance/Education/Investment → AI Core → Integrations → Observability → Hardening → Production.

Avant chaque nouveau lot: rechercher l'existant, réutiliser les invariants, éviter toute duplication.

## Rust / composants systèmes
Rust est autorisé uniquement pour des composants ciblés derrière des contrats versionnés; TypeScript reste le plan de contrôle et PostgreSQL la source de vérité financière. Consulter `docs/architecture/ADR-006-rust-service-boundaries.md` et `docs/construction/RUST-BOUNDARIES-RECORD.md` avant toute implémentation Rust. Le pilote est en attente de CI diagnostiquable, d'un cas d'usage mesuré et de tests de contrat.
