# T.Pay — adoption progressive de Rust

## Décision

Rust est ajouté comme langage complémentaire, sans réécriture générale. Le cœur
applicatif, l'API Gateway, les interfaces et les modules métier TypeScript restent
en place tant qu'une mesure vérifiable ne justifie pas une migration.

## Premier composant

`crates/tpay-ledger-core` fournit une validation pure des invariants de base
d'une transaction comptable : organisation présente, clé d'idempotence syntaxiquement
valide, lignes suffisantes, montants entiers strictement positifs, devise cohérente,
sommes sans dépassement et équilibre débit/crédit.

Cette bibliothèque n'est **pas encore branchée sur le chemin de paiement de production**.
Elle ne fait ni authentification, ni autorisation multi-tenant, ni accès PostgreSQL,
ni réservation atomique d'idempotence, ni appel fournisseur. Ces garanties doivent
être maintenues dans le service applicatif et la transaction PostgreSQL.

## Contrat d'intégration obligatoire avant production

1. Le serveur authentifie l'acteur et vérifie son appartenance à l'organisation.
2. Le service valide les montants et les autorisations.
3. PostgreSQL réserve atomiquement la clé d'idempotence dans une contrainte unique
   (portée par organisation et opération), verrouille les ressources concernées et
   écrit toutes les lignes dans une transaction ACID.
4. Le service appelle le validateur Rust sur le même ensemble de lignes avant le commit.
5. Le commit, l'outbox et l'audit sont cohérents; les appels externes passent par
   des adaptateurs HTTPS contrôlés, jamais depuis le crate Rust.
6. Les rejeux et conflits concurrents sont testés contre PostgreSQL réel, pas seulement
   avec des doubles en mémoire.

## Garde-fous

- Aucun `unsafe`; aucune dépendance externe dans le premier crate.
- Montants en entiers, jamais en virgule flottante.
- Rust ne stocke aucun secret fournisseur et ne contourne pas le coffre de secrets.
- Les erreurs de validation sont des codes typés; ne jamais y incorporer des secrets,
  des jetons, des données personnelles ou le corps brut d'un fournisseur.
- Toute liaison future TypeScript/Rust doit utiliser un contrat versionné et des limites
  de taille explicites; éviter un service réseau supplémentaire tant qu'un appel local
  ou une bibliothèque native suffit.
- Rust n'est déclaré apte à la production qu'après tests, fuzzing des entrées, tests
  de concurrence PostgreSQL et validation CI sur le SHA exact.

## Suites envisageables après mesure

- validation comptable et rapprochement;
- vérification cryptographique et anti-rejeu;
- synchronisation idempotente de la file hors ligne;
- parsers de messages fournisseurs bornés.

Ne pas migrer les agents IA, le frontend ou toute l'API par principe. Choisir les
composants à partir de profils de charge, de menaces documentées et du coût opérationnel.
