# ADR-006 — Introduire Rust par frontières ciblées, sans réécriture globale

- **Statut :** ACCEPTÉ POUR PILOTE, implémentation applicative non démarrée
- **Date :** 2026-10-17
- **Branche :** `construction/super-admin-console-009`
- **Contexte :** T.Pay est actuellement principalement TypeScript/Node.js; aucun `Cargo.toml` n'a été trouvé à la racine de la branche examinée.
- **Décision :** Rust est adapté à certains composants systèmes de T.Pay, mais ne remplace pas le cœur TypeScript par défaut. Toute adoption commence par un pilote isolé, mesurable et réversible.

## 1. Pourquoi Rust est pertinent

Rust apporte un modèle de propriété et d'emprunt qui permet au compilateur de prévenir de nombreuses erreurs de mémoire, ainsi que des outils Cargo pour compiler, tester et verrouiller les dépendances d'un workspace. Ces garanties ne suppriment pas les erreurs métier, les défauts d'autorisation, les erreurs cryptographiques, les races de logique ni les risques provenant de code `unsafe`.

Références primaires consultées :
- Rust Book — Ownership : https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html
- Cargo Book — Workspaces : https://doc.rust-lang.org/cargo/reference/workspaces.html
- Rust Reference — Unsafety : https://doc.rust-lang.org/stable/reference/unsafety.html

Conséquence : Rust est une option pour du code bas niveau, déterministe ou intensif, mais doit rester derrière les contrats de T.Pay et ses tests de sécurité.

## 2. Domaines candidats

Priorité à évaluer après rétablissement d'une CI diagnostiquable :

1. **Parsing/normalisation à surface d'attaque élevée** : parsers bornés pour formats binaires ou protocoles, avec limites de taille, profondeur, temps et mémoire.
2. **Traitement local/offline** : composants déterministes de validation/synchronisation sur appareils contraints, uniquement si un benchmark démontre un gain.
3. **Cryptographie et vérification de signatures** : seulement en utilisant des bibliothèques auditées et des protocoles existants; pas de primitives cryptographiques maison.
4. **Traitements à fort débit** : seulement après profilage démontrant que TypeScript constitue le goulot d'étranglement.

Rust ne doit pas recevoir seul la décision d'autoriser une opération financière ou privilégiée.

## 3. Domaines qui restent autoritatifs dans T.Pay

- TypeScript/API Gateway : orchestration HTTP, sessions, politique d'accès, contrats d'API et compatibilité des clients.
- PostgreSQL : transactions, contraintes, unicité, isolation multi-tenant, idempotence et vérité du ledger.
- Financial Core : toutes les mutations financières autorisées.
- Secret manager/HSM/KMS et fournisseurs vérifiés : secrets et clés de production.
- Rust éventuel : calcul ou validation déterministe derrière un contrat versionné; jamais une source d'autorité concurrente.

Aucun calcul en Rust ne peut remplacer une contrainte SQL, une transaction atomique ou une vérification d'autorisation serveur.

## 4. Contrat d'intégration recommandé

Pour le premier pilote, préférer un **processus/sidecar Rust avec protocole local versionné** à une liaison FFI dans le processus Node.js. Cela isole les pannes, limite le couplage ABI et facilite le rollback. Une intégration native FFI ne sera réévaluée que si la latence mesurée l'exige et si les frontières `unsafe` sont auditées.

Le contrat devra inclure :
- version explicite du schéma et de l'algorithme;
- entrée/sortie structurées, tailles maximales et validation stricte;
- aucune clé, aucun token, aucun secret ni donnée KYC brute dans les arguments de processus ou les logs;
- délai maximal, arrêt propre, limitation des ressources et comportement de panne fail-closed;
- erreurs typées sans fuite d'information sensible;
- identifiant de corrélation non sensible;
- compatibilité rétroactive documentée et tests de contrat partagés TypeScript/Rust.

Les échanges interprocessus doivent être locaux et protégés par les permissions système; aucune écoute réseau non authentifiée. Les secrets ne doivent pas être transmis via arguments CLI.

## 5. Exigences de sécurité et de qualité

Le pilote devra, avant activation :
- compiler en édition Rust stable fixée explicitement dans le projet;
- fixer et committer `Cargo.lock` pour les exécutables;
- exécuter `cargo fmt --check`, `cargo clippy --workspace --all-targets --all-features -- -D warnings` et `cargo test --workspace --all-features`;
- analyser les dépendances et vulnérabilités selon les outils disponibles et conserver les rapports;
- interdire `unsafe` par défaut; toute exception doit être minimale, commentée, revue et testée;
- appliquer des limites d'entrée et tests fuzz/property lorsque le parser est exposé à des entrées non fiables;
- tester entrées malformées, tailles extrêmes, panne du processus, timeout, duplication et comportement concurrent;
- tester l'équivalence du contrat avec l'implémentation de référence TypeScript;
- mesurer latence p50/p95/p99, mémoire, CPU, taille d'artefact et coût d'exploitation face à TypeScript;
- garder le composant désactivable par configuration et prévoir le rollback vers la référence validée.

Ces commandes sont des critères prévus, **pas des tests déjà exécutés**.

## 6. Garde-fous financiers et identité

- Les montants sont transportés en unités entières et devise explicite; jamais en flottants.
- Le composant ne crée, ne confirme, ni ne règle une transaction financière.
- Une réponse Rust n'est pas une preuve d'identité, d'autorisation ou de signature fournisseur.
- Les clés privées restent dans le HSM/KMS ou le fournisseur de secrets; aucune clé n'est compilée dans le binaire.
- Les décisions de rejet/acceptation restent journalisées par les frontières serveur, sans secrets ni payloads sensibles.
- Les reprises et répétitions doivent rester idempotentes dans la base autoritative.

## 7. Séquence de mise en œuvre

1. Restaurer la capacité CI et les logs de job sur un runner réel.
2. Cartographier les modules existants et choisir un cas de référence mesurable; ne pas inventer un nouveau domaine Rust en doublon.
3. Créer un petit workspace `rust/` ou `crates/rust/` seulement après sélection du cas et du contrat.
4. Écrire tests Rust, tests de contrat côté TypeScript et benchmark reproductible.
5. Ajouter un job CI isolé avec cache limité, verrouillage de toolchain et rapport d'échec exploitable.
6. Comparer les résultats et faire une revue sécurité indépendante.
7. Activer d'abord en mode shadow/non-mutant, puis canary limité; revenir à TypeScript si divergence ou régression.
8. Autoriser une extension uniquement sur preuve de valeur et CI verte sur le SHA exact.

## 8. Critères de décision pour généraliser Rust

Adopter le composant seulement si :
- le contrat est stable et la source de vérité reste unique;
- tous les tests de contrat et de sécurité passent;
- aucun secret ou flux financier n'est déplacé hors des contrôles existants;
- le benchmark établit un bénéfice opérationnel mesurable ou une réduction de risque justifiée;
- le coût supplémentaire (toolchain, build multi-plateforme, observabilité, maintenance) est acceptable;
- le rollback a été exercé.

## 9. État actuel et risques ouverts

- Aucun `Cargo.toml` racine trouvé sur la branche examinée; présence d'un workspace Rust existant non établie.
- Le CI du SHA `af657d863af24862c2399953560ec7f7929ab56a` échoue avant toute étape avec runner ID 0, nom vide et aucune étape; cela ne prouve ni succès ni échec du code applicatif.
- Aucun test Rust n'a été exécuté et aucun composant Rust n'est déclaré livré.
- Le choix précis du premier module reste ouvert jusqu'à l'inspection du code complet et au rétablissement de la CI.

**Conclusion :** Rust est adopté comme technologie ciblée à évaluer et intégrer progressivement. Pas de réécriture globale, pas de remplacement du ledger PostgreSQL, pas de certification production avant preuves.
