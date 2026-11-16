# Identity Core — identité multi-organisations avant les API métier

**Statut :** architecture de référence et gate bloquant; non déployé, non certifié.  
**Branche de travail :** `feat/community-tontine-prompt-001-031`  
**PR liée :** #194 — Community Tontine.

## Décision d'architecture

`education_actors` est un registre métier historique du domaine Éducation. Il ne constitue pas l'autorité d'identité de T.Pay et ne doit pas être interrogé par les routes Tontine pour déterminer l'identité, l'appartenance ou les permissions d'un acteur.

L'authentification prouve l'identité du sujet et la validité de sa session. Elle ne confère pas à elle seule une capacité d'accès à une organisation, à un groupe communautaire ou à une ressource métier.

## Modèle cible

1. **Global subject** — identifiant stable de la personne/du principal, indépendant des organisations et des modules.
2. **Tenant membership** — rattachement explicite du sujet à un tenant; état actif/suspendu/révoqué et dates de validité.
3. **Organization membership** — relation sujet/tenant/organisation, statut, dates de validité, source d'invitation et audit.
4. **Role assignment** — rôles affectés dans une organisation et un domaine précis; aucun rôle global implicite.
5. **Permission grants** — permissions explicites, scope tenant + organisation + domaine + ressource, période de validité, révocation et éventuelle limite d'usage.
6. **Device/session** — session liée au sujet, au tenant, à l'appareil et au niveau d'assurance; l'organisation active est un contexte sélectionné et vérifié, pas une propriété immuable de l'identité.
7. **Audit** — création, changement de contexte, octroi/retrait de rôle, révocation, refus d'accès et actions sensibles consignés de façon append-only.

## Flux d'authentification et d'autorisation

- Authentifier le sujet à partir d'une session persistée, non expirée, non révoquée et liée à un appareil valide.
- Résoudre le tenant depuis la session vérifiée; ne jamais faire confiance à un tenant fourni uniquement par le client.
- Vérifier l'appartenance active du sujet à l'organisation demandée dans le tenant.
- Charger les rôles et grants valides à l'instant de la requête; refuser par défaut en cas d'absence, d'ambiguïté ou de panne.
- Produire un contexte d'autorisation immuable : `subjectId`, `tenantId`, `organizationId`, `sessionId`, `domain`, permissions calculées, `issuedAt`, `expiresAt`, `authorizationVersion`.
- Vérifier à nouveau le scope de la ressource au niveau du repository et de PostgreSQL (FK composites + RLS FORCE); une permission d'organisation ne contourne jamais l'isolation d'une ressource.
- Pour les mutations : transaction unique, contrôle de version/concurrence, idempotence, audit et Outbox atomiques. Aucune mutation métier en mode offline.

## Frontières des domaines

- **Éducation** : peut conserver ses profils et rôles métier scolaires, mais référence le sujet global; les règles scolaires ne sont pas exportées vers les autres domaines.
- **Tontine communautaire** : exige une appartenance et des permissions communautaires dédiées (par exemple `community.tontine.read`, `community.members.manage`, `community.admission.decide`). Les rôles d'enseignant, directeur ou comptable scolaire ne donnent aucun accès implicite.
- **Microfinance** : permissions et attestations propres au partenaire, à l'agence et à l'agent; aucune autorité de décision sur la gouvernance communautaire.
- **Financial Core** : reste seul propriétaire du Ledger; l'identité et les permissions ne créent jamais une capacité de poster directement des écritures hors de ses commandes contrôlées.

## Séquence de migration obligatoire

### M0 — Inventaire sans changement de comportement
- Inventorier tous les lecteurs/écrivains de `education_actors`, les sessions, appareils, bootstraps, workers, jobs et tests.
- Identifier les tables d'organisation, les tenants, les clés étrangères et les politiques RLS déjà en place.
- Construire une matrice de compatibilité des acteurs historiques; aucune association tenant/organisation ne doit être devinée.

### M1 — Schéma d'identité global
- Introduire le sujet global et les tables d'appartenance tenant/organisation, affectations de rôles et grants temporels.
- Migration 130 ajoute `tpay_tenants`, le mapping explicite tenant/organisation, les sujets globaux, les liens d'acteurs de domaine, les appartenances tenant/organisation, les grants temporels, les sessions liées aux sessions d'appareil et l'audit append-only.
- La migration 130 ne crée aucune association legacy automatiquement : le mapping et le lien des acteurs doivent être alimentés à partir de preuves vérifiées, avec les lignes ambiguës mises en quarantaine.
- Utiliser des clés étrangères composites garantissant le même tenant et la même organisation sur chaque relation.
- Prévoir unicités partielles pour les appartenances actives, index d'expiration/révocation et audit append-only.
- Ajouter les nouvelles colonnes/références en mode expand; backfill uniquement depuis des correspondances démontrées.
- Les lignes historiques non résolues restent en quarantaine et ne gagnent aucun accès par défaut.

### M2 — Runtime commun
- Créer un résolveur d'identité commun qui valide session + appareil + tenant.
- Ajouter un résolveur de contexte organisationnel et un moteur d'autorisation par domaine.
- Exécuter chaque requête avec contexte PostgreSQL transaction-local; rôle runtime NOLOGIN/NOSUPERUSER/NOBYPASSRLS et grants minimaux.
- Garder les identifiants de migration séparés du compte runtime.
- Interdire les requêtes non scopées et les accès directs aux tables legacy depuis les nouveaux domaines.

### M3 — Compatibilité Éducation
- Adapter l'API Éducation au contexte commun sans casser le contrat existant.
- Maintenir une façade de compatibilité temporaire, instrumentée et limitée dans le temps.
- Comparer en shadow les décisions d'autorisation anciennes/nouvelles; tout écart est bloquant.
- Retirer la dépendance d'authentification à `education_actors` seulement après preuves d'équivalence et de non-régression.

### M4 — API Tontine
- Ajouter les routes HTTP uniquement après validation M1–M3.
- Toutes les routes exigent le contexte commun et une permission communautaire explicite.
- Aucun endpoint ne reçoit un rôle comme preuve d'autorisation depuis le corps ou les en-têtes client.
- Le repository filtre systématiquement tenant + organisation + groupe; les FK composites et RLS constituent une seconde ligne de défense.

### M5 — Web/Mobile
- Web et Flutter utilisent le même contrat d'authentification et de contexte organisationnel.
- Les tokens restent hors du stockage non sécurisé; stockage mobile protégé par le mécanisme natif.
- Changement d'organisation explicite, revalidation serveur, expiration/révocation propagées.
- Les écrans communautaires affichent des données réelles uniquement après authentification; sinon état non connecté, jamais de données de démonstration présentées comme réelles.

## Tests de sécurité obligatoires

- Un sujet appartenant à deux organisations ne peut pas lire les données de l'organisation non sélectionnée.
- Un rôle Éducation n'accorde aucune permission Tontine; un rôle Tontine n'accorde aucune permission Éducation.
- Tenant absent, organisation absente, membership suspendue/expirée, grant expiré/révoqué et session révoquée : refus.
- Manipulation du tenant, organizationId, groupId, actorId et identifiants de ressources par le client : refus.
- Deux tenants partageant un identifiant de ressource ne peuvent pas se lire mutuellement.
- RLS testée avec le véritable rôle runtime non-owner/non-superuser/NOBYPASSRLS, pas avec le rôle de migration.
- Tests PostgreSQL réels : concurrence, rollback, révocation simultanée, changement de contexte, replay/idempotence et audit.
- Les tests couvrent les routes HTTP et les clients Web/Flutter avec sessions réelles de test.

## Gates de livraison

La livraison Tontine ne peut être considérée complète que lorsque les trois lots sont réunis sur un même SHA :

1. migrations d'identité et de domaine appliquées sur PostgreSQL réel avec tests RLS adversariaux réussis;
2. API communautaire authentifiée par le runtime commun et tests HTTP d'isolation réussis;
3. interfaces Web et Mobile connectées à ces API, avec tests de session, permissions, erreurs et révocation.

Les tests unitaires seuls ne valident pas ces gates. Une migration créée, un endpoint compilé ou un écran rendu ne constituent pas une preuve d'intégration.

**État courant de cette PR :** migration 130 pose le schéma d'identité global avec FORCE RLS, sans backfill implicite. Les tests de catalogue PostgreSQL sont ajoutés; ils ne prouvent pas encore l'isolation comportementale avec le rôle runtime non-owner. Le serveur API authentifie toujours via `education_actors`; l'adoption du nouveau résolveur, les routes HTTP Tontine et les écrans connectés ne sont pas livrés. PR maintenue ouverte; aucune fusion, mise en production ou certification revendiquée.
