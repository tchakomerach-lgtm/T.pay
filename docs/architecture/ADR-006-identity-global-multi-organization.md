# ADR-006 — Identity globale et autorisation multi-organisations

- Statut : ACCEPTÉ POUR CONSTRUCTION, NON CERTIFIÉ
- Date : 2026-11-15
- Portée : Identity Core, API Gateway, Organization Core, Education et Community Tontine
- Branche de travail : feat/community-tontine-prompt-001-031

## Contexte observé

Le runtime `apps/api-server/src/main.ts` valide déjà le Bearer Token avec `DeviceTrustRepository`, puis résout l'acteur avec une requête directe à `education_actors`. Il charge ensuite les permissions dans `api_actor_permissions`.

Cette dépendance est incorrecte pour une identité plateforme : une personne membre d'une communauté, d'une entreprise ou d'une microfinance ne doit pas devoir exister dans le registre métier scolaire pour être authentifiée.

Le dépôt possède déjà des contrats de sécurité, de sessions organisationnelles, de confiance appareil et de permissions. Il faut les généraliser et les composer, pas créer un deuxième système d'authentification ni réutiliser aveuglément un schéma scolaire.

## Décision

Introduire une frontière de domaine indépendante :

`Credential/Session Validation -> Global Identity Resolution -> Organization Membership Resolution -> Policy Decision -> Tenant-scoped Request Context -> Domain API`

Le runtime HTTP ne doit plus interroger directement une table métier Education pour authentifier un principal.

### Responsabilités

1. **Identity** : utilisateur global, état du compte, identifiants/passkeys et cycle de vie.
2. **Session** : session active, appareil, révocation, expiration, niveau d'assurance et contexte organisationnel explicitement sélectionné.
3. **Organization** : organisation, tenant, membership, statut d'adhésion et historique.
4. **Authorization** : rôle et permissions effectifs, portée de ressource, conditions contextuelles et fenêtres temporelles.
5. **Audit** : acteur, session, tenant, organisation, action, ressource, décision, corrélation et résultat.

Séparer strictement Identity, Account, Profile, Membership, Role, Position et Actor métier. Un acteur Education est une projection/liaison métier, pas l'identité universelle.

## Contrat du principal authentifié

Le contexte serveur doit être construit exclusivement après validation cryptographique/de session et vérification des données en base. Contrat conceptuel :

```ts
interface AuthenticatedRequestContext {
  userId: string;
  sessionId: string;
  deviceId: string;
  tenantId: string;
  organizationId: string;
  membershipId: string;
  permissions: readonly Permission[];
  assurance: "standard" | "step_up";
  issuedAt: number;
  expiresAt: number;
  policyVersion: string;
}
```

Ce contrat est conceptuel à ce stade : il ne doit pas être introduit dans le code avant d'avoir vérifié les types existants et les migrations présentes. Le navigateur ne peut jamais définir `tenantId`, `membershipId`, `permissions` ou le niveau d'assurance.

## Règles d'isolation

- Chaque ressource organisationnelle est filtrée par `tenant_id` ET `organization_id`.
- L'appartenance doit être active à l'instant de la requête.
- Une session révoquée, expirée, suspendue ou liée à un contexte obsolète est refusée.
- Un utilisateur multi-organisations doit sélectionner un contexte organisationnel explicite ; le changement de contexte déclenche une validation serveur.
- Les permissions sont évaluées côté serveur avec deny-by-default.
- Les privilèges temporaires expirent automatiquement et ne deviennent jamais permanents par défaut.
- Les routes Tontine n'acceptent pas les permissions Education comme substitut à des permissions Community.
- Les requêtes DB sensibles établissent le contexte tenant/organisation dans la transaction ; les politiques RLS sont testées avec un rôle applicatif non propriétaire et non BYPASSRLS.
- Les lectures cross-tenant doivent échouer sans révéler l'existence de la ressource.

## Compatibilité Education

`education_actors` reste le registre métier des acteurs scolaires tant que le domaine Education en dépend. Il peut être relié à l'identité globale par une clé de liaison explicite, unique et auditable.

Aucune migration ne doit copier aveuglément les `actor_id` vers des identifiants utilisateur ni supposer qu'ils sont globalement uniques. Prévoir une phase de rapprochement des comptes, gestion des doublons, comptes orphelins, désactivation et rollback.

Les routes Education continuent de fonctionner pendant la migration, mais leur authentification est fournie par le même Identity Core que les autres domaines.

## Modèle de données cible (à adapter au schéma réellement présent)

- `identity_users` : sujet global.
- `identity_credentials` : références d'authentificateurs, jamais de secrets bruts.
- `identity_sessions` : cycle de vie des sessions, si non couvert par `api_sessions`.
- `organizations` : identité organisationnelle canonique, si non déjà présente.
- `organization_memberships` : lien utilisateur-organisation, statut et période de validité.
- `organization_roles` : rôles attribués dans une portée donnée.
- `permission_definitions` : catalogue versionné des permissions.
- `membership_permissions` / `role_permissions` : attribution effective.
- `temporal_grants` : délégations temporaires, approbations, expiration et révocation.
- `identity_audit_events` : événements append-only.

Avant toute création, l'implémentation doit rechercher les tables et contrats équivalents existants et les réutiliser. Aucun doublon de `api_sessions`, `api_actor_permissions` ou des contrats Organization ne doit être créé sans décision explicite.

## Séquence de migration

1. Inventorier migrations, contraintes, RLS, repositories et contrats existants.
2. Établir les invariants et les correspondances entre utilisateur global, acteur Education et membership.
3. Ajouter les tables/colonnes compatibles, contraintes FK composites et index.
4. Backfill contrôlé avec rapport des comptes ambigus/orphelins ; aucun rapprochement automatique ambigu.
5. Introduire un repository Identity/Organization et une fonction d'autorisation commune.
6. Ajouter tests de non-régression Education et tests multi-organisations.
7. Basculer le runtime vers le resolver commun, en refusant tout principal non résolu.
8. Connecter les routes Community uniquement après preuve que le resolver ne dépend plus d'Education.
9. Conserver la compatibilité de lecture nécessaire, puis retirer les chemins legacy dans une migration distincte après période de vérification.

Toute migration est transactionnelle quand possible, versionnée, checksumée, testée sur PostgreSQL réel et accompagnée d'une stratégie de rollback/forward-fix.

## API communautaire : préconditions

Chaque route Community doit :
- exiger une session authentifiée et une membership active ;
- utiliser des permissions dédiées, par exemple `community.read`, `community.member.manage`, `community.governance.propose`, `community.governance.vote`, `community.contribution.initiate` ;
- appliquer les règles de quorum et de gouvernance au niveau domaine ;
- imposer idempotence, audit et contrôle de concurrence aux commandes ;
- déléguer tout état financier confirmé au Financial Core ;
- ne jamais considérer un callback fournisseur non vérifié comme un règlement.

## Motion/UI et renderer

Les interfaces Web/Mobile consomment le même contrat API et le même modèle de design. Les états visuels reflètent les décisions serveur : active, pending, expired, revoked, denied, offline, syncing et conflict.

Les effets 3D sont décoratifs et non bloquants : aucune permission, décision ou confirmation ne dépend d'une animation. Respect de `prefers-reduced-motion`, performance Android bas de gamme, navigation clavier, contraste et cibles tactiles. Le renderer global DB-074 reste l'objectif ; ne pas créer un deuxième design system.

## Tests de sortie obligatoires

- utilisateur membre de deux organisations avec rôles différents ;
- utilisateur sans membership ;
- membership suspendue, expirée et révoquée ;
- session expirée/révoquée et appareil révoqué ;
- tentative d'utiliser un organizationId d'une autre session ;
- lecture/écriture cross-tenant et cross-organization ;
- rôle Education utilisé sur une route Community ;
- permission temporaire avant/après expiration ;
- changement de rôle pendant une session ;
- RLS avec rôle DB applicatif non propriétaire ;
- concurrence sur révocation et commande métier ;
- audit append-only et absence de secrets dans les logs ;
- régression des routes Education existantes ;
- tests PostgreSQL réels, pas uniquement mocks.

## Gate de livraison

Cette ADR n'est pas une preuve d'implémentation. La livraison reste non certifiée tant que les migrations, le resolver réel, les tests PostgreSQL/RLS, l'API communautaire authentifiée, les clients Web/Mobile connectés et les workflows CI correspondants ne sont pas vérifiés sur le commit exact.

La PR reste ouverte. Aucun merge et aucune mise en production ne sont autorisés par cette décision seule.
