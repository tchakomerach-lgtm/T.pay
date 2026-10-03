# ADR-001 — Fondation T.Pay

T.Pay démarre comme monolithe modulaire fortement cloisonné par domaines, avec commandes et événements typés. Une extraction future en services reste possible.

## Domaines
Identity, Organization, Social, Opportunity, Marketplace, Wallet, Ledger, Payments, Credit, Commissions, Subsidies, Microfinance, Education, Investment, AI Core, Notifications, Documents, Audit, Security.

## Règles
1. Le ledger est la source de vérité financière.
2. Toute opération financière est idempotente.
3. Une écriture postée n'est jamais modifiée; une correction produit une écriture compensatoire.
4. Les permissions sont évaluées côté serveur.
5. Toute action sensible est auditée.
6. L'IA n'obtient aucune autorité implicite de validation financière.
7. Les intégrations externes passent par des ports/adapters.