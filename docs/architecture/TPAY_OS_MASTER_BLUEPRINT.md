# T.Pay OS — Architecture maîtresse de l'ensemble du projet

> Statut : blueprint de référence à appliquer progressivement au dépôt. Ce document décrit la cible et les critères d'acceptation ; il ne prétend pas que tous les modules sont déjà en production.

## 1. Vision produit

T.Pay OS est une plateforme numérique unifiée et multi-organisation pour les personnes, écoles, commerçants, entreprises, associations, tontines et institutions de microfinance. Chaque utilisateur retrouve ses services dans un environnement cohérent, tandis que les données, permissions et opérations financières restent cloisonnées et auditées.

Principes non négociables :
- une identité et une session sécurisées, avec permissions vérifiées côté serveur ;
- une isolation stricte par organisation/tenant et par propriétaire lorsque pertinent ;
- un seul Financial Core et un seul ledger faisant autorité : aucun module métier ne crée son propre solde comptable ;
- toute opération financière est idempotente, traçable, rapprochée et soumise à des contrôles de risque ;
- séparation nette entre démonstration, sandbox, préproduction et production ;
- secrets exclusivement côté serveur, chiffrement des données sensibles, journal d'audit protégé ;
- les intégrations externes sont des adaptateurs remplaçables, jamais une dépendance implicite du domaine métier ;
- une interface commune responsive Web/Mobile, avec accessibilité et prise en charge des réseaux instables ;
- aucun module n'est annoncé « production-ready » avant validation CI, tests d'intégration, sécurité et exploitation.

## 2. Carte fonctionnelle du T.Pay OS

### A. Plateforme et expérience
- Portail T.Pay OS / espace de travail unifié
- navigation par applications et rôles autorisés
- notifications, tâches, recherche globale et activité récente
- paramètres de profil, sécurité, sessions et appareils
- langues, devise, fuseau horaire, accessibilité et mode réseau faible
- onboarding, assistance et centre de documentation

### B. Identité et confiance
- identité utilisateur, authentification et récupération de compte
- KYC/KYB selon les exigences applicables, consentements et gestion des documents
- sessions, MFA/OTP selon le risque, révocation et contrôle des appareils
- organisations, adhésions, invitations, rôles et permissions granulaires (RBAC/ABAC)
- gateway/API BFF : validation, limites de débit, idempotence et corrélation
- coffre-fort de secrets et données sensibles, rotation de clés et audit
- Super Admin avec accès exceptionnel justifié, approbation renforcée et journalisation

### C. Financial Core partagé
- Ledger comptable immuable et écritures équilibrées
- wallets/comptes, paiements, transferts, encaissements et décaissements
- frais, commissions, limites, plafonds et règles de risque
- adaptateurs de prestataires et routage partenaire
- webhooks signés, outbox transactionnelle, reprise et déduplication
- rapprochement opérationnel, prestataire et comptable
- règlement/settlement, litiges, remboursements et rapports
- contrôles anti-fraude, limites, alertes et piste d'audit

Règle : les modules Tontine, Microfinance, School Subsidy, Marketplace et Organisation demandent des opérations au Financial Core ; ils ne modifient jamais directement le ledger ni ne calculent un solde concurrent.

### D. Applications métier
- **Tontine** : adhésions, groupes, règles, cycles, cotisations, gouvernance, bénéficiaires, litiges, notifications et rapprochements.
- **Microfinance** : dossiers, évaluation, comité de crédit, échéanciers, recouvrement, garanties, portefeuille, provisions et reporting ; séparation des décisions et des décaissements.
- **School OS / Education** : écoles, années scolaires, classes, élèves, parents, enseignants, présences, frais, fournitures, reçus et rapports.
- **School Subsidy** : appel à projets d'une école ou d'une microfinance, cahier des charges complet, besoins de fournitures pour tous les élèves, étude/garantie par la microfinance, financement approuvé et remboursement via le mécanisme quotidien de tontine configuré ; consentement, contrat, calendrier, limites et audit obligatoires. Aucune approbation ou garantie ne doit être simulée en production.
- **Organisations & Business OS** : profil organisation, membres, permissions, équipes, services, catalogue, facturation et espaces de travail.
- **Marketplace & Opportunités** : offres, demandes, annonces, mise en relation, vérification et modération ; les annonces ne valent ni identité vérifiée ni paiement.
- **Social / Growth** : flux, pages publiques, campagnes, QR et connecteurs WhatsApp, Facebook/Instagram, TikTok, Telegram et SMS ; consentement, anti-spam et séparation des données.
- **Documents & preuves** : dépôt, versions, signature/validation quand disponible, empreintes, accès et rétention.
- **IA & assistants** : recherche et recommandations avec contrôle d'accès, citations/provenance, minimisation des données et validation humaine pour toute action sensible.
- **Offline & synchronisation** : file locale chiffrée, identifiants idempotents, synchronisation conflictuelle contrôlée ; aucune fausse confirmation de paiement hors ligne.

### E. Console Super Admin
- santé des services, files, incidents et état des déploiements
- gestion gouvernée des tenants, utilisateurs, permissions et configurations
- suivi de sécurité, alertes, audits et anomalies
- supervision des prestataires, rapprochements et incidents financiers
- feature flags, version/configuration, maintenance et rollback
- accès « break-glass » temporaire, motivé, approuvé et audité
- aucun affichage global de données sensibles sans autorisation explicite et justification.

## 3. Architecture logique

Client Web/Mobile
→ API Gateway / BFF
→ Authentification + session
→ résolution du tenant et appartenance
→ permissions (rôle + portée + ressource)
→ validation de schéma + rate limit + idempotence
→ service métier / bounded context
→ PostgreSQL (transactions, contraintes, RLS selon le modèle) + outbox
→ Financial Core uniquement pour les effets monétaires
→ adaptateurs de partenaires
→ événements, notifications, observabilité et audit.

Le Rust peut être utilisé pour des composants isolés où ses garanties et performances sont utiles (workers, traitement concurrent, composants sensibles), derrière des contrats d'API versionnés. Il ne faut pas réécrire le cœur métier existant uniquement pour changer de langage.

## 4. Modèle de données et frontières

- Tenant/Organization : identifiant explicite, membership et état.
- User/Identity : identité globale ; accès à une organisation uniquement via une adhésion active.
- Permission : action + ressource + portée ; vérification serveur à chaque requête.
- Ledger : journal canonique, écritures immuables, références d'idempotence uniques.
- Payment/Provider transaction : états explicites, clés externes et déduplication webhook.
- Domain records : données scolaires, tontine, microfinance ou opportunité, toujours tenant-scoped.
- Audit event : acteur, tenant, action, ressource, résultat, horodatage, correlation ID et motif si privilège élevé.
- Outbox/inbox : publication fiable, reprises contrôlées et protection contre le double traitement.
- Secrets/cryptographie : gestion via gestionnaire de secrets/KMS/HSM lorsque disponible ; aucune clé maîtresse dans le dépôt.

Toute migration doit être additive si possible, réversible ou accompagnée d'un plan de restauration, testée sur une copie et validée avant production. Ne pas modifier/supprimer une API utilisée sans compatibilité et plan de migration.

## 5. Contrat de qualité production

Pour chaque module, les preuves suivantes sont requises :
1. compilation reproductible et lint/typecheck ;
2. tests unitaires métier ;
3. tests d'intégration PostgreSQL réel, migrations et rollback ;
4. tests d'isolation multi-tenant et d'escalade de privilèges ;
5. tests de concurrence, idempotence, double clic, répétition et webhooks dupliqués ;
6. tests API/E2E sur un environnement de préproduction ;
7. scans secrets/dépendances et revue des permissions ;
8. logs sans secrets/PII superflue, métriques, alertes et corrélation ;
9. sauvegarde et restauration vérifiées, plan d'incident et rollback ;
10. déploiement Vercel ou infrastructure cible avec smoke tests, health checks et preuve de commit.

Un déploiement Vercel « Ready » ne prouve que l'état de déploiement de l'artefact, pas la conformité métier ou la sécurité. Un workflow GitHub Actions qui échoue en `startup_failure` n'a pas exécuté les tests et ne peut être considéré comme un succès.

## 6. Séquence de construction

### P0 — Débloquer la livraison et établir la vérité technique
- corriger la disponibilité/exécution des runners GitHub Actions ;
- obtenir un build propre et des tests reproductibles sur le commit exact ;
- confirmer le projet Vercel, l'accès de l'équipe, les variables par environnement et les logs ;
- séparer clairement démo, sandbox et production ; documenter les routes et variables réelles.

### P1 — Fondations de sécurité et de données
- migration PostgreSQL, tests de migration et isolation tenant ;
- identité/session/membership/RBAC, invitations et permissions granulaires ;
- validation d'API, idempotence, audit, rate limiting et secrets côté serveur ;
- tests de concurrence et régression des endpoints existants.

### P2 — Financial Core et adaptateurs
- ledger, wallet/paiement, frais/commissions, outbox, webhooks, rapprochement ;
- simulateur partenaire distinct de tout adaptateur de production ;
- tests de double comptabilisation, remboursement, reprise et rapprochement.

### P3 — Applications métier connectées
- Organisation/Business OS ;
- Tontine ;
- Microfinance ;
- School OS et School Subsidy ;
- Marketplace/Opportunités et Social/Growth ;
- documents, notifications, IA et mode offline.

Chaque application consomme les fondations existantes ; elle ne duplique pas identité, permissions, ledger ou audit.

### P4 — Super Admin et exploitation
- console de santé, tenants, incidents, audits, configuration et déploiement ;
- alertes, sauvegardes/restauration, runbooks et exercices de reprise ;
- pilote limité, approbations opérationnelles et observabilité avant ouverture.

### P5 — Lancement progressif
- pilote avec organisations consentantes et données contrôlées ;
- critères de sortie, support, gestion d'incident, conformité locale et réconciliation ;
- déploiement par feature flags, mesures de stabilité, rollback vérifié et revue après lancement.

## 7. État constaté dans le dépôt au 22 octobre 2026

- PR #145 : prototype School OS interactif en brouillon ; les données sont fictives et en mémoire de session.
- La prévisualisation Vercel de cette PR a signalé « Ready », mais l'accès technique de vérification a rencontré un refus 403 ; le rendu n'a donc pas été confirmé de manière indépendante.
- Sur le commit de PR #145, les workflows GitHub Actions « T.Pay CI » et « T.Pay Android » ont terminé en `startup_failure`, avant exécution des tests.
- En conséquence, ni le prototype ni l'ensemble de T.Pay OS ne doivent être qualifiés de validés pour la production à partir de ces signaux seuls.
- Les statuts des modules listés dans la cible doivent être vérifiés individuellement dans le code, les migrations, les tests et les déploiements ; ce document ne les déclare pas déjà implémentés.

## 8. Définition du résultat attendu

T.Pay OS est prêt pour un pilote réel seulement quand le portail unifié est relié aux services métier réellement implémentés, chaque accès est contrôlé côté serveur, les données persistent en base, les effets financiers passent par le ledger et les adaptateurs validés, les parcours critiques sont couverts par des tests exécutés avec succès et l'équipe peut surveiller, restaurer et annuler un déploiement sans perte de traçabilité.
