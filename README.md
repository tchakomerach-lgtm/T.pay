# T.Pay

T.Pay est un OS/SaaS modulaire pour particuliers et organisations : réseau social, opportunités, marketplace, wallet, microfinance, éducation, investissement et assistants IA spécialisés.

## Fondation implémentée
- Monorepo TypeScript strict et CI.
- Domaines organisations, rôles et sessions organisationnelles.
- Autorisation serveur, idempotence, audit et politique de risque.
- Ledger double-écriture, wallet, paiement et commissions.
- Événements de domaine et observabilité avec redaction des données sensibles.
- Skills persistants pour architecture, sécurité, IA multi-agents et optimisation des coûts/tokens.

## Architecture cible
Identity -> Organizations -> Security -> Ledger -> Wallet/Payments -> Credit/Commissions/Subsidies -> Microfinance/Education/Investment -> Social/Opportunity/Marketplace -> AI Core -> Integrations -> Observability.

Les moteurs financiers restent séparés : ledger, paiement, crédit, commissions et subventions. L'IA ne contourne jamais les permissions, le ledger ou les contrôles de risque.

## Mémoire projet
AGENTS.md contient les règles persistantes de construction et les rôles des sous-agents. Les skills versionnés sont dans docs/skills/.

## Vérification locale
npm install
npm run check

Les exigences réglementaires applicables au Togo/UMOA et à chaque marché cible doivent être vérifiées avant toute mise en production financière.
