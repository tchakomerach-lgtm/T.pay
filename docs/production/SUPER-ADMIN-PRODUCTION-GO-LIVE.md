# T.Pay Super Admin — Production Go-Live Gate

**Statut initial : BLOQUÉ — aucun déploiement de production autorisé.**  
**Branche de travail :** `construction/super-admin-console-009`  
**PR :** #97 (Draft, non fusionnée)

Ce document est un contrôle de mise en production, pas une attestation de conformité. Une case ne peut être cochée qu'avec une preuve vérifiable liée au SHA déployé.

## 1. Bloqueurs observés

- [ ] GitHub Actions démarre un runner réel et publie les étapes/logs pour le SHA exact.
- [ ] `npm run check`, `npm run web:smoke`, `npm run web:check`, `npm run api:check`, `npm --prefix apps/universal run typecheck`, `npm run universal:web:build`, E2E Playwright et audit de dépendances terminent avec succès.
- [ ] Tests PostgreSQL réels et tests adversariaux/concurrence réussissent sur PostgreSQL de version supportée.
- [ ] HSM/KMS réel configuré, clé identifiée par référence non secrète, attestation vérifiée et rotation/révocation testées. Un marqueur `hardware_backed=true` en base n'est pas une attestation matérielle.
- [ ] Connecteurs PAM réels installés et validés sur des cibles non productives; émission et révocation des secrets éphémères, enregistrement de session, filtrage de commandes et arrêt d'urgence testés.
- [ ] Coffre de sauvegarde immuable/WORM ou hors ligne opérationnel; restauration en clean room indépendante réussie et preuve conservée.
- [ ] Origine HTTPS de production, certificats, RP ID WebAuthn, cookies, CSRF, CORS, HSTS, DNS, supervision et rotation des secrets validés.
- [ ] Revue indépendante des privilèges L4/L5, du quorum Root Trust, des journaux d'audit, du plan de rollback et de l'accès break-glass.
- [ ] Responsable de mise en production désigné et approbation explicite avant toute promotion.

## 2. Séquence obligatoire

### A. CI et intégrité de l'artefact
1. Confirmer que le runner est assigné et que les logs de job sont récupérables.
2. Exécuter la suite complète sur le commit candidat exact; conserver SHA, run ID, résultats, rapports E2E et audit.
3. Ne pas traiter un échec avant les étapes comme un résultat de test applicatif.
4. Construire une fois, identifier l'artefact par digest et promouvoir cet artefact sans reconstruction silencieuse.
5. Bloquer la promotion si le SHA validé diffère du SHA candidat.

### B. Base de données
1. Faire une sauvegarde chiffrée et vérifier sa restauration avant migration.
2. Tester toutes les migrations sur une copie de données représentative, puis exécuter les tests d'intégrité et de concurrence.
3. Vérifier les index, contraintes, privilèges SQL minimum, pool de connexions et paramètres TLS PostgreSQL.
4. Exécuter les migrations avec un compte dédié; le compte runtime ne doit pas disposer de privilèges DDL.
5. Vérifier qu'un retour arrière est documenté pour chaque migration non additive; privilégier les changements expand/contract.

### C. Root of Trust et identité privilégiée
1. Enregistrer les authentificateurs et clés via un processus d'enrôlement contrôlé hors bande.
2. Valider WebAuthn/FIDO2 avec authentificateurs enregistrés, RP ID et origine de production exacts.
3. Vérifier que les trois approbateurs Root Trust sont des acteurs distincts de trois domaines indépendamment administrés.
4. Vérifier les signatures contre les clés provisionnées côté serveur; ne jamais accepter une clé publique fournie par le demandeur comme source d'autorité.
5. Tester anti-rejeu, expiration, révocation, rotation, séparation des rôles et refus en cas de panne HSM/KMS.
6. Confirmer que les clés privées et secrets ne figurent ni dans Git, ni dans les images, ni dans les logs, ni dans le navigateur.

### D. PAM et récupération
1. Relier le broker à des connecteurs PAM et un fournisseur de secrets éphémères réels.
2. Prouver qu'une session expirée/révoquée ne peut plus exécuter de commande et que les secrets sont révoqués après échec ou terminaison.
3. Configurer un stockage d'audit inviolable, avec politique de rétention et accès restreint.
4. Créer un snapshot immuable, restaurer dans une clean room isolée et vérifier les digests.
5. Respecter l'ordre de reprise : Trust → Identity → Security → Ledger → Payment → Wallet → Core APIs → Org Data → Media.
6. Ne réouvrir aucun flux financier avant validation indépendante de la confiance, de la réconciliation et des plans critiques.

### E. Déploiement HTTPS
1. Déployer d'abord dans un environnement de préproduction isolé, avec données synthétiques.
2. Vérifier TLS 1.3, certificats valides, HSTS, cookies Secure/HttpOnly/SameSite appropriés, CSRF et absence de route HTTP de secours.
3. Effectuer les scénarios navigateur réels : connexion, WebAuthn, expiration de session, refus d'accès non autorisé, double approbation, audit et déconnexion.
4. Effectuer un test de charge et un test de reprise; définir les seuils d'alerte et le responsable d'astreinte.
5. Promouvoir progressivement avec critères d'arrêt automatiques, surveillance des erreurs et procédure de rollback répétée.
6. Garder la console d'administration accessible uniquement via les contrôles d'identité, de réseau et de privilège approuvés.

## 3. Critères de refus immédiat

Arrêter la mise en production si l'un des cas suivants survient :
- runner/CI non diagnostiquable, test ignoré ou preuve attachée à un autre SHA;
- HSM/KMS, PAM ou coffre immuable représenté uniquement par une interface ou un faux adaptateur;
- absence d'attestation, d'approbation indépendante ou de journal d'audit exploitable;
- restauration non testée, divergence de ledger ou reprise financière non réconciliée;
- vulnérabilité critique/haute non résolue, secret exposé, route HTTP, ou contrôle d'accès contournable;
- impossibilité de restaurer le service ou de révoquer les accès privilégiés.

## 4. Preuves à joindre avant toute promotion

- SHA exact et URL de l'exécution CI verte;
- rapports des tests unitaires, API, navigateur, PostgreSQL/concurrence et audit de dépendances;
- digest de l'artefact et provenance de build;
- rapport d'attestation HSM/KMS et tests de rotation/révocation;
- preuves de test PAM, restauration clean-room et intégrité des journaux;
- rapport de revue indépendante et approbation de mise en production;
- plan de rollback avec responsable, délais mesurés et critères d'arrêt.

## 5. Décision actuelle

**NO-GO.** Le dépôt ne fournit pas encore les preuves opérationnelles nécessaires pour certifier ces gates. La PR #97 doit rester Draft et non fusionnée tant que les critères bloquants ne sont pas satisfaits. Aucun secret, certificat privé ou jeton ne doit être ajouté au dépôt pour tenter de débloquer le déploiement.
