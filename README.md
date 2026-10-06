# T.Pay

T.Pay est un OS/SaaS modulaire pour particuliers et organisations : réseau social, opportunités, marketplace, wallet, microfinance, éducation, investissement et assistants IA spécialisés.

## Web Alpha — première application testable

La Web Alpha fournit désormais une véritable interface navigateur construite à partir du dépôt T.Pay, avec un endpoint HTTP `/v1/health` relié au module Health du core. Elle est volontairement en **mode démonstration** : aucune opération financière réelle et aucun contournement des contrôles serveur.

### Prérequis
- Node.js 22+
- npm 11+
- Git

### Lancement pour débutant

```bash
npm install
npm run web:dev
```

Puis ouvrir **http://localhost:4173** dans Chrome.

Pour arrêter le serveur : `Ctrl+C`.

### Parcours de test
1. Accueil : vérifier les métriques et le flux.
2. Organisations : créer une organisation de démonstration.
3. Réseau social : vérifier la navigation.
4. Opportunités : vérifier la navigation.
5. Tontine communautaire : vérifier qu'elle reste distincte de la tontine journalière intégrée aux microfinances.
6. Recharger la page : les données de démonstration conservées dans le navigateur doivent rester disponibles.
7. Tester sur Android : lancer le serveur sur l'ordinateur et ouvrir son adresse réseau locale depuis le téléphone connecté au même Wi-Fi.

### Vérifications automatisées

```bash
npm run check
npm run web:smoke
npm run web:check
```

La Web Alpha ne constitue pas encore une mise en production. Le prochain raccordement doit connecter l'identité, l'API Gateway, PostgreSQL et les vrais services métier derrière des contrats serveur testés.


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

### Sécurité Web Alpha

La configuration de production exige des certificats TLS et refuse de démarrer sans eux. Le serveur utilise TLS 1.3 lorsqu'il est configuré en HTTPS. Les réponses appliquent notamment HSTS, CSP, nosniff, Referrer-Policy, Permissions-Policy, COOP et CORP. Ces contrôles suivent les recommandations OWASP actuelles sur TLS, HSTS, sessions et CSP.

En développement local, HTTP peut rester disponible uniquement pour faciliter le premier test. Il ne doit jamais être utilisé pour une session ou des données réelles. En production, le certificat TLS est obligatoire et HTTP ne doit pas devenir un canal applicatif.
