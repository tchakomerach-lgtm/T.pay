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
## Runtime API de production

Le serveur exécutable est `apps/api-server/src/main.ts`. Il démarre uniquement avec PostgreSQL et TLS configurés :
- `TPAY_DATABASE_URL`
- `TPAY_TLS_KEY_FILE`
- `TPAY_TLS_CERT_FILE`
- `TPAY_API_HOST` (défaut `0.0.0.0`)
- `TPAY_API_PORT` (défaut `8443`)

Commandes :
```bash
npm install
npm run check
npm run api:start
```

Le runtime applique les migrations avant d'écouter, valide les sessions par `api_devices` / `api_sessions`, charge les permissions organisationnelles depuis `api_actor_permissions`, impose HTTPS/TLS 1.3 et expose `/health/live` et `/health/ready`.

### Test local contrôlé

Pour créer un compte de test éphémère, définir explicitement `TPAY_ALLOW_LOCAL_TEST_SEED=true`, puis :
```bash
npm run api:seed:test
```
La commande affiche un jeton de session de test. Ne pas utiliser ce mécanisme en production.

Un certificat TLS public ou une AC de développement approuvée par l'appareil est nécessaire pour le test Android réel. Le serveur ne fournit volontairement aucun fallback HTTP.
