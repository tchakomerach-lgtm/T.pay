# Bible Tontine communautaire — Registre historique récupéré des prompts 001 à 031

**Dépôt :** `tchakomerach-lgtm/T.pay`  
**Branche :** `feat/community-tontine-prompt-001-031`  
**PR :** #194 (brouillon)  
**Nature du document :** reconstruction à partir des conversations historiques récupérées. Ce document distingue les éléments explicitement retrouvés des prompts dont le texte intégral n'a pas été retrouvé. Il ne remplace pas les prompts originaux mot pour mot.

## Règles transversales obligatoires

- La Tontine communautaire est un domaine produit indépendant. Les microfinances partenaires fournissent des services limités et consentis; elles ne prennent pas le contrôle de la gouvernance, de la constitution, des votes ou de la rotation communautaire.
- Le Financial Core de T.Pay est l'unique autorité des écritures financières confirmées. Aucun second ledger tontine.
- Une réponse fournisseur, un webhook non vérifié ou un état `provider_pending` ne constitue pas un règlement. Vérification de signature/fraîcheur, anti-rejeu, rapprochement et transaction Financial Core sont obligatoires.
- Chaque commande est autorisée par tenant/groupe, idempotente, auditée et résistante à la concurrence.
- Les opérations offline sont des intentions signées à synchroniser; elles ne modifient jamais directement le Ledger.
- Les commissions, frais et seuils sont des politiques versionnées et auditables. Toute règle de taux issue d'un prompt doit être réconciliée avec le moteur de politique et les exigences contractuelles/réglementaires; ne pas coder silencieusement un taux global.
- Les écarts, litiges, suspicions, expirations et timeouts passent par un état d'exception et la réconciliation; aucune correction silencieuse.
- Les écritures postées et événements historiques sont immuables; correction par transaction compensatoire.

## Inventaire historique par prompt

### Prompt 001 — Fondations de la Tontine communautaire
Le registre historique confirme un prompt fondateur couvrant le périmètre, l'architecture, les rôles, les états, les workflows, les règles métier, les cycles, les cotisations, l'idempotence, le mode offline, la gouvernance, le risque/IA, l'audit, les API, l'isolation tenant, les intégrations, l'observabilité, les tests et les critères d'acceptation. Le titre exact et le texte intégral ne sont pas récupérés.  
**Code existant associé :** ADR-004, TPAY-TONTINE-CYCLE-001, community-tontine.ts, community-tontine-service.ts, cycle/rules/reconciliation.  
**État :** partiel; ne pas certifier sans texte original, UI/API réelle et preuves.

### Prompt 002 — Texte historique non récupéré
Titre, exigences et critères d'acceptation non retrouvés. Ne pas inventer.

### Prompt 003 — Intégration ultra-sécurisée Tontine communautaire ↔ Microfinance
Résumé historique : connecteurs partenaires; identité et consentement; intents de paiement et webhooks; routage multi-partenaires; règlement et rapprochement; séparation du crédit et de la tontine; litiges, audit et kill switch.  
**Code associé :** community-tontine-mf-*.ts, migrations 106–114, repositories/approval/settlement.  
**État :** partiel; adaptateurs fournisseurs réels et E2E restent à prouver.

### Prompt 004 — Système d'adhésion sécurisée, vérification tiers, attestation de confiance et collecte personnalisée
**Source :** texte fourni dans la conversation du 15 novembre 2026; le texte reçu est tronqué à la fin de la section 58, au statut `EXIT_P...`. Les sections 1 à 57 et le début de la section 58 sont disponibles; la suite exacte de la machine d'état ne l'est pas.

Exigences récupérées :
- Séparer strictement la vérification tierce, la structuration T.Pay et la décision d'admission de la gouvernance. La microfinance vérifie/atteste; T.Pay valide la provenance, structure les preuves et construit le Trust Profile; l'administrateur décide.
- Créer `ThirdPartyTrustAttestation` / TPTA avec portée explicite, émetteur, agent/agence, candidat, tontine, dates, version, signature, statut, révocation, expiration, remplacement et contestation. Une attestation est une preuve limitée, jamais une garantie absolue.
- Niveaux distincts : non vérifié, identité vérifiée, profil financier vérifié, attestation tierce, confiance communautaire. Aucun booléen `trusted=true`, aucun score moral et aucune confusion avec un Credit Score.
- Le candidat choisit un partenaire de vérification autorisé. Le choix, sa raison, le consentement et la portée du partage sont enregistrés. Vérification en agence via token/QR temporaire, lié au candidat/dossier/tontine, à usage limité, anti-rejeu et non porteur de données sensibles.
- Authentifier l'agent et vérifier son agence, rôle, terminal, session, autorisation et état du partenaire. Conserver les références de vérification et minimiser la copie des pièces d'identité. Biométrie brute non transférée par défaut.
- Résultat de matching explicite : MATCH, PARTIAL_MATCH, MISMATCH, UNABLE_TO_VERIFY. Un mismatch interdit l'émission automatique de l'attestation. Signature cryptographique et vérification de révocation/expiration obligatoires.
- Construire un Trust Profile factuel et un Trust Passport partageable avec consentement, finalité, destinataire et durée limités; divulgation sélective et approche zero-knowledge lorsque pertinente.
- La décision d'admission reste à l'administrateur : ACCEPT, REJECT, REQUEST_MORE_INFORMATION, HOLD, avec motifs objectifs, double contrôle si nécessaire, recours, historique et audit. Ni la microfinance, ni l'administrateur, ni le Super Admin ne peuvent falsifier le résultat d'une vérification.
- Distinguer `VERIFICATION_PARTNER` et `COLLECTION_PARTNER`. Le membre peut choisir son collecteur parmi les rails autorisés, changer de collecteur selon une procédure contrôlée et conserver l'historique.
- Définir un `MemberContributionPlan` fondé sur un objectif total, une fréquence personnalisée et des échéances compatibles avec le cycle. La fréquence individuelle ne modifie pas automatiquement la durée, le montant global, la rotation ou les droits des autres membres.
- Mandat de paiement récurrent distinct de l'adhésion : consentement explicite, plafond, fréquence, expiration, pause/révocation. Distinguer échec technique et défaut; retry, notification, délai de grâce, exception fournisseur et pénalité seulement après vérification des règles.
- Détecter les signaux de collusion/fraude sans condamnation automatique; les alertes IA sont explicables et soumises à revue humaine. Audit, anti-rejeu, isolation tenant, permissions et minimisation des données s'appliquent à tout le parcours.

**Modèles/agrégats à tracer :** `TontineVerificationToken`, `VerificationSession`, `ThirdPartyTrustAttestation`, `TrustEvidence`, `TontineTrustProfile`, `TrustPassportGrant`, `MembershipApplication`, `MembershipDecision`, `CandidateAppeal`, `MemberContributionPlan`, `PaymentMandate`, `CollectionPartnerAssignment`, `PaymentFailure/GracePeriod/PenaltyDecision`.
**État :** spécification fonctionnelle récupérée jusqu'au texte visible; fin de section 58 et sections suivantes manquantes. Aucune implémentation ni conformité certifiée par la seule récupération du texte.

### Prompt 005 — Tontine multi-microfinances, collecte individuelle, rotation, distribution et commissions
Résumé historique : chaque participant peut choisir sa microfinance; fréquence et montant de cotisation configurables; collecte individuelle; rotation des bénéficiaires; distribution; commissions; Mobile Money; consentements et rapprochement. L'indépendance de la tontine doit être préservée malgré plusieurs partenaires.  
**État :** exigences fonctionnelles historiques retrouvées sous forme de résumé; vérifier chaque flux dans l'implémentation.

### Prompt 006 — Rotation Engine & Distribution Engine
Résumé historique : moteur d'ordre de bénéficiaires auditable; gestion des pots avec états expected/collected/cleared/distributable; règlement; retraits; double entrée exclusivement via Financial Core. Rotation non modifiable rétroactivement sans procédure gouvernée et auditée.  
**État :** résumé récupéré; tests de concurrence et preuves de règlement nécessaires.

### Prompt 007 — Trust & Admission Engine
Résumé historique : admission des membres; attestation de microfinance; capacité de cotisation; cautionnement communautaire; score explicable; décision d'admission et piste d'audit. Le score ne doit pas devenir une décision opaque; recours humain et minimisation des données à appliquer.  
**État :** résumé récupéré; critères détaillés du score et du recours à confirmer dans le prompt source.

### Prompt 008 — Collection Engine & Agent Terrain
Résumé historique : agents terrain; tournées; QR; collecte offline; preuves; synchronisation et réconciliation; gestion des litiges; contrôles antifraude. Réaffectation d'un agent sans changer l'identité de la cotisation. Géolocalisation = preuve contextuelle, jamais facteur unique d'authentification.  
**État :** résumé récupéré; application terrain et chaîne offline réelle à valider.

### Prompt 009 — Smart Distribution & Inter-Microfinance Settlement
Résumé historique : versement bénéficiaire; netting entre microfinances; destination du bénéficiaire; états de règlement; rapprochement multi-institutions. Le netting ne peut pas créer de monnaie ni contourner le Financial Core.  
**État :** résumé récupéré; connecteurs et settlement live requis.

### Prompt 010 — Rotation intelligente, ordre des bénéficiaires & protection du tour
Titre retrouvé. Le texte détaillé n'a pas été récupéré. Le périmètre explicitement connu porte sur la rotation intelligente, l'ordre et la protection du tour du bénéficiaire. Ne pas ajouter de règles précises non confirmées.

### Prompt 011 — Smart Collection & Settlement Reconciliation Fabric
Résumé historique : Contribution Truth Engine; états expected/collected/confirmed/settled/reserved/distributed; synchronisation multi-microfinance; snapshots de cycle; rapprochement; event bus; observabilité; gestion des opérations offline et isolation des pannes. Le moteur doit établir la vérité de la contribution depuis les preuves vérifiées et le Ledger, pas depuis une déclaration client/fournisseur.

### Prompt 012 — Risk, Fraud & Collusion Command Center
Résumé historique : RiskEvent et RiskGraph; détection comportementale, appareil/compte compromis, fraude fournisseur, collusion; playbooks; holds ciblés; dossiers d'enquête; décision humaine; appels; gouvernance ML/IA et traçabilité. Les blocages doivent être proportionnés, limités et contestables.

### Prompt 013 — Community Geo-Trust & Participation Boundary Engine
Résumé historique : couverture pays/région/ville/polygone/rayon; preuves d'identité, de localisation et d'affiliation microfinance; consentement; signaux géographiques minimisés; protection de la vie privée; revue collaborative des risques. La position n'est pas une preuve d'identité.

### Prompt 014 — Zero Trust Tontine & Cyber Resilience Fabric
Résumé historique : sécurité des administrateurs et microfinances; MFA; appareils; coffre et rotation des clés; séparation des environnements; anti-bot; sauvegardes immuables; reprise après sinistre; continuité offline. Gouvernance de commissions avec séparation des comptes participant/T.Pay/microfinance/administration, CommissionSplitEngine, AdminCommissionAccount et FeePolicyEngine; wallets séparés; tests de sécurité, commissions et recovery.

### Prompt 015 — Dynamic Commission Governance & Pricing Control Fabric
Résumé historique : T.Pay fixe, autorise ou négocie le taux; modes FIXED, ADMIN_SELECT, NEGOTIABLE et HYBRID; Policy Resolver; versions; PricingSnapshot; vote/quorum; Fee Lock; transparence; APIs; simulation et tests de gouvernance tarifaire. Une synthèse historique mentionne un plancher serveur de 6%; cette règle doit être confirmée dans le prompt source et son champ légal/contractuel avant activation. Elle ne doit pas être confondue avec un taux universel arbitraire dans le domaine.

### Prompt 016 — Tontine Growth, Promotion & Multi-Platform Distribution Fabric
Résumé historique : promotion T.Pay et externe; profils publics; découverte marketplace; boosts gratuits/payants; QR et deep links; WhatsApp, Facebook, Instagram, TikTok, Telegram, SMS et email; attribution et analytics de campagne; media kits; modération; antifraude; confidentialité; gel/révocation de campagne.

### Prompt 017 — Trusted Recruitment, Referral & Community Ambassador Engine
**Source :** texte complet fourni dans la conversation du 15 novembre 2026.

Exigences confirmées :
- Séparer invitation, candidature, éligibilité, vérification, évaluation de confiance, validation partenaire, cautionnement éventuel, décision administrateur et activation. Un clic ou une recommandation ne crée jamais un membre.
- Machine d'état candidat : DISCOVERED → APPLIED → VERIFYING → APPROVED → ACTIVE, avec REJECTED, EXPIRED, WITHDRAWN et SUSPENDED.
- Candidature minimale et proportionnée; Eligibility Engine; quotas minimum/cible/maximum; sur-réservation explicitement autorisée; liste d'attente avec priorité fondée sur éligibilité, dossier complet, vérification et date, jamais sur un paiement pour acheter un rang.
- Referral Engine : liens, QR et codes attribués; distinguer partage simple et recommandation personnelle. Le parrain ne décide pas de l'admission. Cautions multiples selon les règles, sans transformer une recommandation en garantie financière implicite.
- Trust Graph pour les relations de recommandation, cautionnement et participation; détection de boucles/collusion comme signaux à examiner, jamais preuve automatique de fraude.
- Rôle Tontine Ambassador à permissions minimales. RBAC + ABAC; aucune permission d'accepter un membre, changer les commissions/cycle/bénéficiaire, consulter les pièces d'identité ou les données financières privées, modifier le partenaire ou collecter des espèces.
- Campagnes de recrutement par objectif, zone et délai; équipes d'ambassadeurs; mesure de qualité (candidats qualifiés, vérification, activation, rétention et abus) plutôt que volume brut d'invitations.
- Limites de fréquence d'invitation, anti-spam, anti-bot et signaux device/IP combinés. Un appareil ou une IP partagés ne constituent jamais seuls un motif de bannissement; l'identité unique respecte les règles applicables.
- Les données microfinance sont limitées aux attestations autorisées. Les scores composites sont explicables, contestables, non moraux et non discriminatoires; risque élevé déclenche vérification/revue humaine, pas exclusion automatique.
- Refus motivé par des catégories objectives et recours candidat. Expiration des dossiers, auto-remplacement depuis la liste d'attente avant verrouillage, sans réécriture de la rotation, du Ledger ou des transactions.
- MembershipLockAt, snapshot final et verrouillage; invitations à usage unique ou quota; ReferralBatch; QR d'ambassadeur; analytics de conversion et détection d'abus.
- Récompenses éventuelles uniquement liées à une relation directe et à des événements qualifiés; récompenses non financières possibles; interdiction de chaîne de rémunération pyramidale.
- Community Health et Copilot IA pour statistiques/recommandations. L'IA ne peut ni accepter/refuser définitivement, ni changer commission/bénéficiaire, ni débloquer ni modifier le Ledger.
- Pré-candidatures terrain offline chiffrées et synchronisées comme événements signés; aucune acceptation définitive hors ligne. Événements terrain avec QR et conditions; aucun encaissement informel par un ambassadeur.
- Séparer comptablement Tontine Fee, Promotion Budget, Referral Reward et Administrator Revenue.

**Modèles/agrégats à tracer :** `TontineCandidate`, `EligibilityDecision`, `TontineWaitlist`, `Referral`, `ReferralBatch`, `Ambassador`, `AmbassadorPermission`, `Caution`, `TrustGraphEdge`, `RecruitmentCampaign`, `RecruitmentEvent`, `RecruitmentQuota`, `CandidateAppeal`, `MembershipLock`, `MembershipSnapshot`, `AmbassadorRewardEligibility`.
**État :** exigences fonctionnelles récupérées depuis le texte fourni; les règles détaillées de scoring, de quota, de récompense et de conservation doivent être paramétrées, documentées et testées. Pas de décision d'admission automatisée.

### Prompt 018 — Community Onboarding, Membership Lock & Smart Tontine Launch Fabric
**Source :** texte complet fourni dans la conversation du 15 novembre 2026.

Exigences confirmées :
- Transformer les membres acceptés en groupe effectivement prêt à démarrer. Une simple égalité entre nombre de membres acceptés et capacité cible ne suffit pas.
- Tontine Readiness fondée sur des contrôles explicites : composition, identité, partenaires, cautions si exigées, consentements, cycle, montants/fréquences, commissions, ordre des bénéficiaires, canaux, limites, notifications, incidents et sécurité. Un pourcentage agrégé ne peut masquer un contrôle bloquant.
- Pre-Launch Control Room avec problèmes actionnables; machine d'état DRAFT → RECRUITING → VERIFYING → MEMBERSHIP_FINALIZING → READY_TO_START → ARMED → ACTIVE, plus PAUSED/SUSPENDED/UNDER_REVIEW/EMERGENCY_HOLD.
- Membership Lock et snapshot immuable, signé et horodaté comprenant membres, ordre, règles, paramètres financiers, partenaires, calendrier et bénéficiaires. Hash calculé sur représentation canonique; toute modification critique après armement annule l'armement et impose recalcul, approbation et nouvel armement.
- Approbation à deux niveaux selon montant/risque/règles. Séparation des privilèges administrateur et droits de participant; contrôle des conflits d'intérêts, notamment lorsque l'administrateur est lui-même bénéficiaire.
- Publication de l'ordre final et consentement explicite individuel sur montant, frais, durée, fréquence, règles de retard et rotation. Aucun consentement silencieux.
- Recalcul des frais/commissions à partir de politiques versionnées et d'un snapshot tarifaire. Toute règle de minimum (y compris le 6 % évoqué dans des éléments historiques) doit être vérifiée dans la Bible contractuelle et la politique applicable avant activation; ne pas coder un taux global implicite. Afficher séparément montant payé et montant net reçu par le bénéficiaire.
- Pre-funding/capability checks sans transaction financière réelle : disponibilité, authentification, limites, plafonds et capacité. État des microfinances et canaux; routage et routes de secours uniquement si autorisés et consentis.
- Calendrier et ContributionDueEngine pour fréquences individuelles différentes, échéances communes, montants attendus, reçus, soldes restants, paiements partiels et alertes préventives.
- Distinguer PAYMENT_FAILED, PARTIALLY_PAID, MEMBER_DEFAULT et panne fournisseur. Retry, délai de grâce, exceptions techniques et pénalités seulement après vérification des règles. Escalade graduelle et ciblée.
- Pause de cycle et gouvernance configurable; décisions de sécurité, identité, Ledger et conformité ne peuvent être désactivées par vote.
- État ARMED avant ACTIVE; démarrage planifié avec pre-flight au dernier instant. Fail-safe : si un élément critique ne peut être confirmé, bloquer/retarder le lancement. Idempotency key pour empêcher le double démarrage.
- Transactional Outbox pour mutation + audit + événement atomiques; dispatcher asynchrone. Event sourcing/audit des événements critiques, sans remplacer le Ledger financier.
- Rapprochement régulier T.Pay / microfinance / fournisseur. Écarts en exception; aucune correction silencieuse, uniquement demande d'ajustement autorisée et auditée.
- Offline limité à la consultation de données synchronisées et aux intentions signées; aucune mutation financière, acceptation ou distribution sensible hors ligne.
- Réconciliation des références T.Pay et partenaire, reçus numériques, journal personnel, alertes hiérarchisées et résumé quotidien utile.
- Participant Readiness privé, pas de classement public humiliant; Risk Engine en temps réel et re-vérification en cas de changement sensible.

**Modèles/agrégats à tracer :** `TontineReadinessCheck`, `TontineLaunch`, `TontineSnapshot`, `ConfigurationHash`, `ParticipantReadiness`, `FinalParticipationConsent`, `ContributionSchedule`, `ContributionDue`, `LateContribution`, `GovernanceDecision`, `LaunchPreflight`, `ReconciliationException`, `PaymentIntent`, `OutboxEvent`.
**État :** exigences fonctionnelles récupérées depuis le texte fourni; lancement réel non certifié tant que les API, transactions PostgreSQL, outbox, UI, connecteurs et tests terrain ne sont pas prouvés.

### Prompt 019 — Smart Contribution Collection & Real-Time Tontine Operations Engine
Résumé historique : cotisations identifiées par cycle; suivi des montants et statuts, y compris partiels; opérations tontine en temps réel. Le détail complet du schéma et des critères n'a pas été récupéré. À relier au Contribution Truth Engine et au settlement sécurisé du Prompt 011.

### Prompt 020 — Tontine Dispute, Incident & Recovery Engine
Résumé historique : litiges; incidents; collecte et conservation des preuves; holds ciblés; médiation; récupération; rapprochement; agents offline; SLA; appels; analyse des causes racines et prévention; Safe Mode. Les incidents ne doivent pas autoriser de correction directe du Ledger.

### Prompt 021 — Tontine Trust, Risk & Community Safety Engine
Résumé historique : confiance et risque dynamiques; garanties; comportements collectifs; prévention de fraude de groupe; sécurité communautaire; tontines individuelles et B2B/inter-entreprises. Distinguer le risque individuel, le risque du groupe, le risque partenaire et le risque systémique; décisions explicables et recours.

### Prompt 022 — Texte incomplet / objectif partiellement retrouvé
L'historique comporte une section intitulée « Objectif du PROMPT 022 » à proximité du Prompt 021, mais le titre exact et le corps complet ne sont pas récupérés. Ne pas attribuer arbitrairement un titre ou des fonctions.

### Prompt 023 — Capital Allocation & Beneficiary Orchestration
Résumé historique : positions bénéficiaires; méthodes d'allocation; priorités; readiness; réserves; pools de projets; routage multi-tontines; analytics de concentration et d'équité; prévisions; séparation stricte du Financial Core. L'orchestrateur propose/coordonne l'allocation, mais seul le Financial Core exécute les mouvements comptables.

### Prompt 024 — Tontine Economic Network & Community Market Engine
Résumé historique : agrégation de la demande communautaire; RFQ; achats groupés et approvisionnement; intelligence fournisseurs; commandes; livraison; qualité; retours; opportunités B2B; antifraude/anti-collusion; commerce offline. Les achats et ventes sont des opérations distinctes des cotisations et du Ledger tontine.

### Prompt 025 — Tontine Inter-Community Network & Cross-Tontine Coordination Engine
Titre retrouvé; détails historiques partiels. Coordination entre communautés/tontines, interopérabilité et coopération cross-tontine. Toute fédération doit préserver l'isolation tenant, le consentement, la gouvernance locale et la séparation des fonds; pas de transfert implicite de pouvoir entre groupes. Détails complets à récupérer.

### Prompt 026 — Tontine Community Intelligence, Economic Digital Twin & Predictive Decision Engine
Titre retrouvé; résumé historique : intelligence communautaire; jumeau numérique économique; prévisions et aide à la décision. Les projections doivent être distinguées des données financières confirmées; explicabilité, provenance, qualité des données, scénarios et validation humaine obligatoires. Détails complets à récupérer.

### Prompt 027 — T.Pay Autonomous Operations & Agentic Control Plane
Titre retrouvé; résumé historique partiel : plan de contrôle d'opérations autonomes/agents. Les agents peuvent observer, recommander et exécuter uniquement des actions explicitement autorisées; permissions bornées dans le temps, provenance d'intention, journal d'audit, approbation humaine et kill switch pour actions sensibles. Aucun agent ne peut contourner les règles du Financial Core.

### Prompt 028 — T.Pay Real-Time Trust, Identity & Agent Security Fabric
Résumé historique détaillé : identité unifiée humain/organisation/microfinance/appareil/session/document/transaction/agent IA; preuves et attestations vérifiables; divulgation sélective respectueuse de la vie privée; passkeys/WebAuthn; confiance appareil/session; authentification adaptative au risque; autorisation OPA/Cedar RBAC/ABAC; KYA (Know Your Agent); jetons d'intention et chaîne cryptographique intention→action→transaction; KMS/HSM et rotation des clés; identités service/API; récupération; anti-SIM-swap et anti-Sybil; événements offline signés et anti-rejeu; Security Event Fabric; fédération d'identité; Trust Tokens; machine à états; APIs/modèle de données; tests, red team, phases MVP, KPIs et architecture.

### Prompt 029 — T.Pay Real-Time Fraud, Anti-Money-Laundering, Anti-Scam & Financial Crime Intelligence Engine
Titre proposé dans l'historique; contenu détaillé non récupéré. Intention explicitement retrouvée : séparer détection, investigation, conformité, blocages préventifs, décisions humaines et exécution financière. Ne pas présenter comme spécification approuvée complète.

### Prompt 030 — Texte historique non récupéré
Titre, exigences et critères d'acceptation non retrouvés.

### Prompt 031 — Texte historique non récupéré
Titre, exigences et critères d'acceptation non retrouvés.

## Carte de code connue dans le dépôt

- Domaine/règles : `community-tontine.ts`, `tontine-rules.ts`, `tontine-cycle.ts`, `tontine-rotation.ts`.
- Contribution/payout : `community-tontine-service.ts`, `tontine-payout.ts`, `tontine-payout-orchestrator.ts`, `tontine-payout-settlement.ts`.
- Persistance/isolation : `tontine-repositories.ts`, `community-tontine-mf-repositories.ts`, migrations 100–114.
- Callbacks/rapprochement : `tontine-provider-callback.ts`, `tontine-reconciliation.ts`, `tontine-receipt-evidence.ts`.
- Offline/continuité : `tontine-offline.ts`, migration 102.
- Gouvernance/cas/intelligence : `tontine-governance.ts`, `tontine-governance-policy.ts`, `tontine-case.ts`, `tontine-economic-network.ts`, `tontine-intelligence.ts`.
- Microfinance partenaire : `community-tontine-mf-operations.ts`, `community-tontine-mf-approval.ts`, `community-tontine-mf-settlement-repository.ts`.

## État de récupération

- **Texte fonctionnel fourni dans cette conversation :** prompts 004, 017 et 018 (Prompt 004 tronqué à la fin de la section 58).\n- **Résumé récupéré antérieurement :** prompts 001, 003, 005–009, 011–016, 019–021, 023–028.
- **Titre ou intention seulement :** prompts 010 et 029.
- **Partiel/incomplet :** prompts 022, 025–027.
- **Non récupéré :** prompts 002, 030 et 031. La fin du Prompt 004 après le fragment `EXIT_P...` reste manquante.
- Ce document est une reconstruction des éléments retrouvés dans les conversations antérieures; il ne prétend pas contenir le texte intégral mot pour mot de chacun des 31 prompts.

## Portes de réalisation et d'acceptation

Pour chaque prompt, transformer chaque exigence en identifiant stable et tracer : règle métier, écran Web/Mobile, état UI, endpoint API authentifié, permission, contrainte/migration DB, événement d'audit, test, signal d'observabilité et preuve d'acceptation.

Ne pas déclarer un prompt terminé à partir d'un nom de fichier, d'un mock, d'un module de domaine isolé ou d'un test non exécuté. Exiger UI/API réellement câblées, persistance réelle, tests négatifs de sécurité, tests PostgreSQL/concurrence pertinents et CI verte sur le SHA exact. Un échec GitHub Actions avec `runner_id=0`, zéro étape et aucun log est un blocage d'infrastructure, pas un résultat de test.


## Addendum de traçabilité — réception des PROMPTS 004, 017 et 018

Date de réception : 2026-11-15.

Ces textes ont été fournis directement dans la conversation et doivent être considérés comme sources fonctionnelles fournies par le propriétaire du produit. Ils remplacent les anciennes mentions « non récupéré » ou résumés approximatifs pour les numéros concernés, sous réserve de la troncature explicitement signalée pour le Prompt 004.

### Dépendances et frontières entre prompts
- Prompt 004 fournit l'admission, l'attestation tierce, le Trust Profile/Passport et le plan individuel de collecte.
- Prompt 017 fournit l'acquisition des candidats, le parrainage, les ambassadeurs, la liste d'attente et le verrouillage du recrutement.
- Prompt 018 consomme les membres admis et finalise consentements, snapshots, readiness, armement et lancement.
- Le Prompt 016 reste le domaine de promotion/distribution marketing. Le Prompt 017 commence après l'exposition promotionnelle et traite l'acquisition/recrutement qualifié; ne pas dupliquer les campagnes média du 016.
- Le Prompt 019 traite l'exploitation quotidienne des contributions après lancement; le Prompt 018 ne doit pas implémenter un second moteur de collecte temps réel.
- La vérification microfinance du Prompt 004 ne confère aucun droit de gouvernance. La recommandation/caution du Prompt 017 ne remplace ni vérification ni admission. Le Prompt 018 ne peut activer que des membres valablement admis et ayant donné les consentements requis.

### Règles de cohérence à appliquer avant implémentation
1. Aucun score moral, score de crédit implicite ou classement public des personnes. Les indicateurs sont factuels, contextualisés, explicables et contestables.
2. Aucun taux de commission universel ne doit être introduit à partir d'un exemple isolé. Résoudre la politique applicable et son snapshot; vérifier contractuellement toute règle de minimum avant activation.
3. La liste d'attente, le remplacement et le verrouillage ne doivent jamais réécrire une rotation déjà commencée, une écriture Ledger ou une transaction.
4. Un token QR, une attestation ou un statut partenaire ne valent pas authentification/settlement par eux-mêmes. Vérifier signature, portée, expiration, révocation, anti-rejeu et identité de l'acteur.
5. Les agents, ambassadeurs et IA n'ont que des permissions minimales. Aucune acceptation finale autonome, aucun mouvement Ledger direct, aucune collecte d'espèces informelle.
6. L'armement/lancement doit être idempotent, transactionnel, audité, soumis à pre-flight et fail-closed sur les contrôles critiques.
7. Les parcours offline produisent des intentions/événements signés; les décisions d'admission et mutations financières sensibles nécessitent validation serveur.

### Critères d'acceptation transversaux à ajouter à la matrice d'implémentation
Pour chaque agrégat : tests tenant isolation, autorisation RBAC/ABAC, consentement et révocation, anti-rejeu/idempotence, concurrence, expiration, audit immuable, erreurs fournisseur, reprise offline, tests de non-divulgation des données, tests de non-contournement de gouvernance, et preuve UI/API/PostgreSQL sur le SHA testé. Toute fonctionnalité affichée dans l'interface doit être reliée à un endpoint autorisé et à une persistance réelle; aucun écran décoratif ou mock ne constitue une livraison.
