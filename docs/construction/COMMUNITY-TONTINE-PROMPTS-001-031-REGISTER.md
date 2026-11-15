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

### Prompt 004 — Texte historique non récupéré
Titre et exigences non retrouvés.

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
Résumé historique : workflow candidat; quotas et sur-réservation; liste d'attente; parrainage et cautions; ambassadeurs; RBAC/ABAC; anti-spam/bot/Sybil; vérification microfinance; score de confiance; appels; expiration; remplacement; dates de verrouillage; recrutement offline; événements; analytics; garde-fous sur récompenses.

### Prompt 018 — Texte historique non récupéré
Le numéro apparaît dans la séquence historique, mais titre et exigences détaillées ne sont pas récupérés. Ne pas inventer.

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

- **Résumé récupéré :** prompts 001, 003, 005–009, 011–017, 019–021, 023–028.
- **Titre ou intention seulement :** prompts 010 et 029.
- **Partiel/incomplet :** prompts 022, 025–027.
- **Non récupéré :** prompts 002, 004, 018, 030, 031.
- Ce document est une reconstruction des éléments retrouvés dans les conversations antérieures; il ne prétend pas contenir le texte intégral mot pour mot de chacun des 31 prompts.

## Portes de réalisation et d'acceptation

Pour chaque prompt, transformer chaque exigence en identifiant stable et tracer : règle métier, écran Web/Mobile, état UI, endpoint API authentifié, permission, contrainte/migration DB, événement d'audit, test, signal d'observabilité et preuve d'acceptation.

Ne pas déclarer un prompt terminé à partir d'un nom de fichier, d'un mock, d'un module de domaine isolé ou d'un test non exécuté. Exiger UI/API réellement câblées, persistance réelle, tests négatifs de sécurité, tests PostgreSQL/concurrence pertinents et CI verte sur le SHA exact. Un échec GitHub Actions avec `runner_id=0`, zéro étape et aucun log est un blocage d'infrastructure, pas un résultat de test.
