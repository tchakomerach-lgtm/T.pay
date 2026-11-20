# T.Pay Health Ecosystem — Bible d'intégration et de monétisation

**Référence :** TPAY-HEALTH-ECOSYSTEM-003  
**Version :** 3.0 — CRM, Social OS, portails et modèle économique  
**Statut :** contrat d'architecture et de domaine ; les capacités marquées contract-only ou planned ne sont pas livrées  
**Socle :** Organization OS, Identity, Security Fortress, Financial Core, Events/Outbox et Design Bible  
**Date :** 18 novembre 2026

## 1. Décision d'architecture

T.Pay Health Ecosystem réunit trois produits sans fusionner leurs responsabilités :

- **Pharmacy OS** : organisation pharmaceutique autonome.
- **Hospital OS** : hôpital, clinique ou établissement de soins autorisé.
- **Health Connect** : portail et couche d'intermédiation entre clients, patients, établissements et prestataires.

Les types `pharmacy`, `hospital` et `clinic` existent déjà dans `OrganizationType`. Cette Bible ne doit pas créer de nouveaux alias ni de deuxième registre des organisations. Elle ajoute des capacités métier spécialisées à l'Organization OS existant.

La pharmacie hospitalière est un sous-domaine de l'Hospital OS. Elle ne devient pas une pharmacie commerciale indépendante par défaut.

## 2. Provisionnement commun de toute organisation

À la création d'une organisation, T.Pay doit produire un manifeste de capacités calculé depuis le type d'organisation, les options contractuelles, la juridiction et les autorisations. Le manifeste ne vaut jamais autorisation d'exécuter une action.

### 2.1 Capacités transversales standard

Chaque organisation peut recevoir les capacités suivantes, selon l'état réel de leur implémentation et les options souscrites :

- CRM et gestion des relations.
- Réseau social interne et fil d'activité.
- Messagerie professionnelle et groupes.
- Gestion des membres, équipes, rôles et compétences.
- RH, recrutement et onboarding.
- Documents, modèles, signatures et archivage.
- Calendrier, réunions, gardes et réservations de ressources.
- Projets, tâches, workflows et approbations.
- Notifications et centre de communication.
- Tableaux de bord, rapports et analytics.
- Assistant IA spécialisé.
- Gestion des fournisseurs, partenaires et contrats.
- Facturation, abonnements et centre financier connecté au Financial Core.
- API, webhooks et intégrations.
- Support, réclamations, incidents et satisfaction.
- Gestion de marque et génération de documents.

La présence d'une capacité dans le catalogue n'implique pas qu'elle soit déployée. Chaque capacité porte un état explicite : `implemented`, `contract_only`, `planned`, `restricted` ou `disabled`. Les capacités non implémentées ne doivent pas apparaître comme actives dans l'interface.

### 2.2 CRM spécialisé

**Pharmacy CRM**
- Comptes clients et contacts professionnels.
- Historique des commandes commerciales autorisées.
- Demandes, réclamations, retours et satisfaction.
- Fournisseurs, grossistes et partenaires.
- Prospects B2B et demandes de devis.
- Suivi des commandes et livraisons.
- Fidélité et campagnes non médicales autorisées.
- Préférences et consentements de communication.

**Hospital CRM**
- Relations administratives avec patients et représentants autorisés.
- Demandes de rendez-vous et d'information.
- Relations institutionnelles et entreprises partenaires.
- Assureurs, mutuelles et organismes payeurs.
- Référents et correspondants professionnels.
- Réclamations, qualité de service et satisfaction.
- Suivi administratif des demandes.

Le CRM n'est jamais un dossier médical. Il ne contient ni diagnostic, ni notes cliniques, ni ordonnance, ni résultat biologique. Les identifiants CRM ne permettent pas de contourner les autorisations du dossier patient.

### 2.3 Réseau social interne

Chaque organisation dispose d'un espace privé, isolé par organisation :
- Fil d'actualité et annonces officielles.
- Groupes par service, équipe ou projet.
- Publications, commentaires, réactions et mentions.
- Sondages et événements.
- Partage documentaire soumis aux permissions.
- Recherche et modération.
- Signalement de contenu.
- Historique et audit des actions d'administration.

Les espaces inter-organisations sont désactivés par défaut. Une communauté professionnelle externe ne peut être ouverte que par configuration explicite, avec modération et règles de confidentialité. Aucune donnée patient ne peut être publiée dans le réseau social interne.

### 2.4 Portail personnel du personnel

Le portail employé réutilise l'identité T.Pay et le contexte organisationnel :
- Profil professionnel et qualifications vérifiées.
- Équipe, service, fonction et responsable.
- Planning, horaires, gardes et disponibilités.
- Congés et demandes administratives.
- Tâches, projets et workflows.
- Messagerie et annonces internes.
- Formations et documents professionnels.
- Demandes d'accès temporaires.
- Notifications et historique des actions.
- Déclaration d'incident et signalement confidentiel.

Les données RH et les données cliniques sont séparées. Le rôle « employé » ne confère pas un accès global aux dossiers des patients.

## 3. Health Connect — portails externes

### 3.1 Compte client et compte patient

Un compte T.Pay peut avoir plusieurs relations, mais les contextes restent séparés :
- **Client** : relation commerciale, commande, livraison, facture et service.
- **Patient** : relation de soins, rendez-vous, documents médicaux et consentements.
- **Représentant** : droits délégués pour une personne dépendante, limités par finalité et durée.

La conversion d'un client en patient ne doit jamais être automatique. Un lien entre profils doit être explicite, traçable et révocable.

### 3.2 Portail patient

- Établissements suivis.
- Rendez-vous et téléconsultations.
- Documents médicaux publiés par un professionnel habilité.
- Résultats validés.
- Prescriptions autorisées.
- Factures et reçus.
- Consentements et délégations.
- Demandes administratives.
- Suivi post-hospitalisation.
- Notifications privées.
- Journal des accès et gestion de la confidentialité.

Le patient ne peut pas modifier un résultat, une prescription ou un compte rendu validé. Une correction passe par un professionnel habilité et laisse une trace.

### 3.3 Portail client pharmacie

- Recherche de produits autorisés.
- Disponibilité indicative ou confirmée.
- Demande de réservation.
- Téléversement sécurisé d'une ordonnance lorsque requis.
- Validation pharmaceutique.
- Devis et confirmation de commande.
- Paiement via Financial Core.
- Retrait ou livraison.
- Suivi et preuve de remise.
- Réclamation, retour et remboursement.

## 4. Pharmacies et hôpitaux de garde

Les gardes sont deux domaines distincts : `pharmacy-duty` et `hospital-duty`.

Une entrée publique doit inclure l'établissement, le service concerné, la période de validité, le fuseau horaire, la source, la date de dernière confirmation et l'état de vérification.

États de publication :
- `draft`
- `pending_verification`
- `verified`
- `published`
- `expired`
- `suspended`
- `cancelled`

Une garde officielle ne peut être présentée comme vérifiée que si la source habilitée ou l'autorité compétente a confirmé le planning. Une déclaration de l'établissement peut être publiée comme « déclarée par l'établissement », jamais comme « garde officielle » sans preuve.

Pour les hôpitaux, la disponibilité est déclarée par service (urgences, maternité, pédiatrie, imagerie, laboratoire, etc.). « Hôpital ouvert » ne signifie pas que tous les services sont opérationnels. L'application doit afficher la fraîcheur des données et proposer le contact direct. Elle ne remplace pas les secours.

## 5. Pharmacy OS — commandes et livraison

### 5.1 Machine à états des commandes

Toute transition est vérifiée côté serveur :
`draft -> submitted -> review_pending -> approved -> payment_pending -> paid -> preparing -> ready -> out_for_delivery/pickup -> delivered/collected -> closed`.

Branches contrôlées : `partially_approved`, `rejected`, `cancelled`, `expired`, `refund_pending`, `refunded`, `disputed`.

Le statut `paid` exige une confirmation autoritaire de Financial Core. Un callback est signé, authentifié, idempotent et rapproché. Une capture d'écran ou un retour client ne constitue pas une preuve de paiement.

### 5.2 Stock et dispensation

- Le stock disponible est calculé par produit, lot, emplacement et réservation.
- Les lots rappelés, périmés, bloqués ou non conformes sont exclus de la vente.
- La règle FEFO est appliquée lorsque pertinente.
- La validation d'ordonnance et la dispensation restent sous responsabilité d'un pharmacien habilité.
- Une réservation temporaire n'est pas une dispensation.
- Les ventes multi-pharmacies restent des sous-commandes et transactions indépendantes.

### 5.3 Livraison

Le livreur reçoit uniquement les données indispensables : référence de mission, adresse de remise, contact nécessaire, instructions de transport et preuve attendue. Il n'accède pas au dossier médical ni au contenu détaillé d'une ordonnance.

La géolocalisation est limitée à la mission, avec consentement et durée de conservation définis. Les produits thermosensibles ou soumis à transport particulier ne sont livrés que si la chaîne de conservation est démontrée.

Preuve de remise : OTP, signature ou autre méthode autorisée. Une livraison n'est close qu'après preuve vérifiée ou résolution d'incident.

## 6. Hospital OS — parcours et téléconsultation

- Agenda par professionnel, spécialité, service et site.
- Prévention transactionnelle des doubles réservations.
- Admission, lit, transfert et sortie.
- Consultation, notes cliniques et prescriptions.
- Laboratoire et imagerie avec statuts de validation.
- Pharmacie hospitalière et dispensation interne.
- Soins infirmiers et administration documentée.
- Facturation et prise en charge.
- Portail patient et suivi post-hospitalisation.

Téléconsultation :
- Vérification de l'identité et de l'habilitation du professionnel.
- Consentement et information préalables.
- Salle audio/vidéo sécurisée.
- Messagerie et partage documentaire autorisés.
- Gestion des interruptions réseau.
- Compte rendu créé et validé par le professionnel.
- Orientation vers une consultation physique ou un service d'urgence si nécessaire.

Pas d'enregistrement audio/vidéo par défaut. Pas de diagnostic, prescription, triage ou décision thérapeutique autonome par l'IA.

## 7. Temps réel

Les événements doivent suivre le pipeline transactionnel :
`domain transaction -> transactional outbox -> event processor -> authorization filter -> SSE/WebSocket/push -> client`.

Les notifications ne sont pas la source de vérité. Elles affichent un état déjà validé par le domaine. Reconnexion, replay, déduplication, ordre, idempotence et catch-up sont nécessaires. Les données sensibles sont exclues des payloads push et des journaux.

## 8. Modèle de revenus T.Pay

### 8.1 Revenus récurrents prioritaires
- Abonnements Pharmacy OS par site et niveau de service.
- Abonnements Hospital OS/Clinic OS selon modules, lits ou sites, avec tarification contractuelle.
- Options CRM, analytics, multi-agences, API, support et formation.
- Hébergement et services professionnels lorsque contractuellement définis.

### 8.2 Revenus à l'usage
- Livraison et coordination logistique.
- Notifications/SMS au coût réel plus marge contractuelle transparente.
- API et intégrations.
- Stockage ou traitement documentaire au-delà du forfait.
- Outils IA facturés par forfait ou consommation plafonnée.

### 8.3 Revenus conditionnels à validation juridique
- Frais de plateforme sur commande pharmaceutique.
- Frais de réservation ou d'intermédiation.
- Frais de téléconsultation.
- Services de mise en relation.

Ces revenus ne sont activés que si la juridiction, le contrat, les obligations professionnelles et la structure de paiement les autorisent. Aucune commission sur diagnostic, prescription ou décision clinique. Pas de commission cachée ni de frais prélevés sans consentement contractuel.

### 8.4 Exclusions
T.Pay ne vend pas les données des patients, ne monétise pas les dossiers médicaux, ne vend pas de priorité clinique, ne vend pas de classement sponsorisé présenté comme recommandation médicale et ne conditionne pas l'accès aux informations d'urgence à un abonnement.

### 8.5 Tarification

Les prix proposés dans les documents commerciaux sont des hypothèses à tester. Ils ne deviennent pas des tarifs de production sans étude des coûts, tests d'acceptation client, taxes, concurrence et validation juridique. La grille est versionnée par pays, devise, période et contrat.

### 8.6 Comptabilité et Financial Core

Séparer :
- abonnement facturé ;
- service consommé ;
- commande ;
- facture établissement ;
- paiement confirmé ;
- frais logistiques ;
- commission autorisée ;
- remboursement ;
- revenu T.Pay reconnu.

Le Financial Core demeure seul propriétaire du ledger, des paiements, des remboursements et de la réconciliation. Un événement commercial ne poste jamais directement une écriture de ledger.

## 9. Architecture et sécurité

- Réutiliser Identity, Organization OS, Security Fortress, Audit, Events/Outbox et Financial Core.
- Ne pas créer de deuxième authentification, de deuxième wallet ou de deuxième moteur de permissions.
- Toutes les ressources sont liées à l'organisation propriétaire et au contexte autorisé.
- Séparer les coffres logiques : CRM, RH, patients, clinique, finance, livraison, géolocalisation.
- RLS et contraintes composites doivent empêcher les relations inter-tenant.
- Les permissions sont évaluées côté serveur, deny-by-default et limitées dans le temps.
- L'accès exceptionnel est motivé, approuvé, limité et audité.
- Les notifications, analytics et outils IA appliquent la minimisation des données.
- Les qualifications et autorisations professionnelles sont vérifiées et leur expiration suivie.

**Gate bloquant :** l'inspection de la branche principale révèle que le runtime API utilise encore un lien d'acteur Education et que le modèle canonique global utilisateur/organisation/tenant est en cours de consolidation dans d'autres branches. Aucune migration santé ne doit inventer `tenant_id = organization_id`, ni contourner ce chantier. Avant les migrations santé, établir le contrat d'identité canonique, sa stratégie de compatibilité/backfill, les politiques RLS et les tests négatifs.

## 10. Interfaces et expérience

Réutiliser exclusivement les tokens et composants du Design System T.Pay. Les écrans sont contextuels, responsive, accessibles WCAG 2.2 AA et utilisables sur Android bas de gamme.

Motion design :
- profondeur 3D discrète pour les cartes de service et les vues de capacité ;
- transitions 160–260 ms pour navigation et micro-interactions ;
- visualisation de lits et services sans remplacer les listes accessibles ;
- suivi livraison animé uniquement avec événements confirmés ;
- états skeleton, offline, syncing, stale, conflict et permission-denied ;
- respect de `prefers-reduced-motion` et mode faible consommation.

Ne pas construire de renderer parallèle. Le contrat DB-074 doit être retrouvé/confirmé sur la branche de référence avant de créer les écrans React et Flutter. Une maquette visuelle ou une animation ne vaut pas une fonctionnalité connectée.

## 11. Contrats de capacité et statut de livraison

Une capacité doit déclarer :
- identifiant stable ;
- types d'organisation éligibles ;
- périmètre de données ;
- dépendances ;
- permissions requises ;
- statut d'implémentation ;
- exigences réglementaires ;
- plan de test ;
- propriétaire métier.

Le registre de capacités est descriptif. Il ne donne jamais une permission et ne rend pas une route active.

États de livraison :
- `specified` : Bible/contrat documenté ;
- `implemented` : code métier livré ;
- `integrated` : API/UI branchées ;
- `verified` : tests applicables réussis avec preuves ;
- `production_eligible` : revue sécurité, conformité, sauvegarde, observabilité et validation terrain terminées.

## 12. Ordre d'implémentation

1. Registre de capacités commun, sans changer OrganizationType.
2. Contrats de domaine Health et séparation CRM/patient.
3. Politique de revenus et catalogue d'offres, sans poster de ledger.
4. ADR identité/tenant et permissions santé.
5. Migrations PostgreSQL après validation de l'identité canonique.
6. API Pharmacy et Hospital.
7. Portail personnel, CRM et réseau social réutilisés depuis le socle commun.
8. Portail patient/client.
9. Garde, commandes, livraison et téléconsultation.
10. React et Flutter depuis le contrat UI DB-074.
11. Tests réels, audit, conformité et terrain.

## 13. Gates de validation obligatoires

- Typecheck et tests unitaires.
- PostgreSQL réel : migration, RLS, contraintes composites, concurrence, replay et idempotence.
- Tests inter-tenant négatifs (pharmacie A/B, hôpital A/B, CRM vs patient, personnel vs patient).
- Tests d'ordonnance, lot, péremption, rappel et dispensation.
- Tests de confirmation Financial Core et remboursements.
- Tests garde officielle vs déclaration locale.
- Tests de double réservation et d'affectation de lit.
- Tests de téléconsultation et révocation de consentement.
- Tests SSE/WebSocket, déconnexion et catch-up.
- Web, Android et Flutter réels.
- Accessibilité, motion réduit, faible débit et petits écrans.
- Revue sécurité, conformité locale, restauration et preuve terrain.

Aucun merge ou statut production-ready avant validation PostgreSQL, Web, Android et Flutter. Les branches et PR existantes, notamment la PR #194, ne doivent pas être modifiées par ce chantier.
