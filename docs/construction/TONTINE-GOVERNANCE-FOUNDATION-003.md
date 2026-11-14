# Tontine communautaire — Gouvernance versionnée (003)

## Domaine et règles

- Le modèle de vote reconnaît explicitement `approve`, `reject` et `abstain`.
- Les règles valident des pourcentages entiers bornés et le booléen d'abstention.
- Le quorum utilise le nombre de bulletins déposés; une abstention peut participer au quorum si la politique le permet.
- Les votes multiples d'un même membre et les bulletins rattachés à une autre proposition sont rejetés.
- Les fenêtres de proposition ont des contrôles de dates et d'état.
- Les propositions conservent une photographie immuable de la politique, du quorum, du seuil d'approbation et du nombre de membres éligibles.

## Livraison implémentée

- Politique de groupe versionnée avec lecture et mise à jour authentifiées.
- Création de proposition réservée aux membres actifs et groupes configurés en `member_vote`.
- Vote unique par membre, avec verrouillage transactionnel de la proposition.
- Finalisation après l'heure de clôture, sur la base des seuils photographiés.
- Mutations sous transaction PostgreSQL tenant-scoped avec idempotence, audit et Outbox.
- Routes Web et Flutter raccordées aux commandes de gouvernance.
- Tests API des règles de politique, de la création, du vote, de la clôture et de l'absence de finalisation anticipée.

## Incidents et litiges

Le dossier d'incident est un sous-domaine distinct de la gouvernance. L'API expose la création de dossiers et, depuis la tranche de cycle de vie, la transition authentifiée et idempotente d'un dossier. Chaque transition vérifie l'état précédent sous verrou PostgreSQL et écrit audit et Outbox dans la même transaction. Le renderer Web expose la prise en charge initiale d'un dossier ouvert.

## Garde-fous

- Une politique explicite est obligatoire pour ouvrir un vote; aucune valeur arbitraire n'est substituée.
- Une seule voix par membre et proposition, garantie par contrainte unique et contrôles du domaine.
- Les écritures sont exécutées sous contexte tenant/organisation.
- L'ouverture, le vote, la clôture et les transitions de dossier écrivent audit et Outbox dans la même transaction que la mutation.
- Une décision de gouvernance ne déplace jamais directement de fonds.
- Les remboursements, contributions et décaissements restent des opérations financières distinctes, autorisées et exécutées par Financial Core.

## Gates encore ouverts

- Tests PostgreSQL concurrents sur les courses vote/finalisation, idempotence et transition de dossier.
- Matrice d'autorisations métier finale par rôle, notamment pour médiation, revue administrative et clôture.
- Workflow de preuve et d'attachement documentaire, holds ciblés et remboursement Financial Core.
- Finalisation planifiée des propositions par worker durable avec lease/retry.
- E2E terrain Web/Flutter sur PostgreSQL réel, puis certification Android et réseau instable.

Une CI verte valide le code exécuté dans ses jobs; elle ne remplace pas les gates terrain et de concurrence explicitement listés ci-dessus.

## P061 — Dossiers communautaires : preuves traçables

- Ajout des routes authentifiées `GET/POST /v1/tontine/groups/:groupId/cases/:caseId/evidence`.
- Une preuve est indexée par empreinte SHA-256, type, acteur, date de capture et référence opaque de stockage interne.
- Le serveur refuse les URL distantes et les chemins traversants (`..`) comme références de pièce jointe.
- L'écriture verrouille le dossier, vérifie le périmètre organisation/groupe, applique l'idempotence, l'unicité du hash par dossier, l'audit et l'Outbox dans la même transaction PostgreSQL.
- La lecture est bornée à 100 éléments et rejoint le dossier pour garantir le périmètre du groupe.
- Cette API enregistre les métadonnées d'une preuve déjà stockée ; elle ne fournit pas encore le stockage binaire ou l'upload signé. Le stockage objet chiffré, l'antivirus, la rétention légale et les URL de téléchargement à durée limitée restent à intégrer avant usage terrain.
- Aucun remboursement, blocage de solde ou mouvement Ledger n'est déclenché par cette fonctionnalité.

Validation attendue : tests API négatifs/positifs, tests PostgreSQL live RLS/concurrence, et vérification du service de stockage avant activation de l'upload utilisateur.
