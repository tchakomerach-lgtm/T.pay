# T.PAY AI — PROMPT 020
## Voice Fabric, téléphonie, rendez-vous et opérations vocales sécurisées — 2026–2030

## 1. Mission

Construire une couche vocale transverse de T.Pay utilisable par toutes les organisations. Voice Fabric est une interface d'exécution contrôlée, pas une nouvelle autorité métier.

Règle absolue :

`Voix → transcription/intention → identité/confiance → politique → capacité → approbation → workflow → service métier → audit`

Interdit :

`Voix → modèle → base de données`

Le modèle peut comprendre, planifier et proposer. Le moteur de politique et les services métier décident si une action est autorisée.

## 2. Intégration sans duplication

Prompt 020 s'appuie sur les briques déjà établies :
- mémoire/contexte : récupération minimale et finalité contrôlée ;
- observabilité/évaluation : traces, tests, coût, qualité et red teaming ;
- Tool Fabric : outils deny-by-default, capacités temporaires, validation de schéma ;
- Knowledge Fabric : connaissances vérifiées et provenance ;
- Agent Runtime : exécution durable, reprise et approbation ;
- Agent Factory/Skills : Voice Receptionist, Scheduler, CRM, Support, Finance, etc. comme compositions de skills ;
- Decision Intelligence : recommandations vocales sans autorisation implicite ;
- Security Bible : identité, secrets, sessions, anti-abus et audit ;
- Financial Core : toute mutation financière passe par le ledger et ses commandes canoniques.

Voice Fabric ajoute uniquement la frontière spécifique au média vocal.

## 3. Architecture

```
T.Pay OS
  ↓
Voice Fabric
  ├─ Voice Gateway (PSTN/SIP/WebRTC/Mobile/Web)
  ├─ Session Manager
  ├─ Voice Identity & Trust
  ├─ Consent/Privacy
  ├─ ASR/TTS/Realtime Adapter
  ├─ Intent & Entity Parser
  ├─ Voice Policy Engine
  ├─ Voice Agent Router
  ├─ Capability Lease Manager
  ├─ Call Workflow Engine
  ├─ Appointment Engine
  ├─ Human Handoff
  ├─ Recording/Transcript Vault
  ├─ Voice Risk & Fraud
  ├─ Prompt-Injection Firewall
  ├─ Tool Gateway
  └─ Audit/Evidence
```

OpenAI Realtime ou équivalent est un fournisseur cognitif/media interchangeable. Les contrôles serveur de T.Pay restent l'autorité.

## 4. Configuration Voice par organisation

Chaque organisation peut déclarer :
- numéros entrants/sortants et files ;
- départements/extensions ;
- horaires, jours fériés et fuseaux ;
- langues et dictionnaires de prononciation ;
- agent vocal/version ;
- motifs d'appel et scripts ;
- connaissances autorisées ;
- outils autorisés ;
- niveaux de risque maximum ;
- règles de transfert humain ;
- types de rendez-vous ;
- ressources/personnels/calendriers ;
- consentement/enregistrement ;
- conservation audio/transcriptions ;
- SLA et métriques.

Une configuration publiée est versionnée et immuable. Une nouvelle version passe par le même cycle de validation que les autres agents/skills.

## 5. Appels entrants

Pipeline :
1. réception ;
2. vérification de l'intégrité du canal/webhook ;
3. création d'une session courte ;
4. annonce de l'agent et du consentement lorsque requis ;
5. détection de langue ;
6. identification facultative ;
7. scoring de confiance ;
8. capture structurée de l'intention ;
9. policy check ;
10. récupération du contexte minimal ;
11. planification d'outils ;
12. step-up si nécessaire ;
13. exécution via Tool Fabric ;
14. confirmation du résultat ;
15. transfert ou fin ;
16. audit post-appel.

Caller ID n'est jamais une preuve d'identité.

## 6. Appels sortants

Un appel sortant doit posséder :
- purpose ;
- base de contact autorisée ;
- consentement applicable ;
- fenêtre horaire ;
- budget ;
- limite de tentatives ;
- politique de contenu ;
- numéro de présentation ;
- mécanisme d'opt-out ;
- résultat attendu.

Le moteur bloque l'appel si le consentement est révoqué, la fenêtre est interdite, le budget est dépassé ou le contexte organisationnel est absent.

## 7. Rendez-vous

Le moteur gère :
- disponibilités ;
- ressources ;
- personnel ;
- durée ;
- buffers ;
- conflits ;
- fuseau horaire ;
- récurrence ;
- liste d'attente ;
- confirmation ;
- déplacement ;
- annulation ;
- rappels ;
- créneaux urgents ;
- rendez-vous groupe/famille ;
- ressources matérielles.

La réservation doit être idempotente et, en production, protégée par une contrainte de conflit côté base de données/transaction. L'implémentation mémoire de référence sert de test contractuel, pas de remplacement de PostgreSQL.

## 8. Agents vocaux

Les agents sont des profils composés de skills :
- Voice Receptionist ;
- Voice Secretary ;
- Voice Scheduler ;
- Voice CRM ;
- Voice Sales ;
- Voice Support ;
- Voice Collections ;
- Voice HR ;
- Voice Education ;
- Voice Microfinance ;
- Voice Operations ;
- Voice Security ;
- Voice Executive Assistant ;
- Voice Interpreter ;
- Voice Safety Router.

Aucun profil ne possède automatiquement tous les outils.

## 9. Matrice de risque V0–V5

| Niveau | Exemple | Contrôle |
|---|---|---|
| V0 | horaires, adresse publique | information publique |
| V1 | information personnalisée faible risque | session/contexte minimal |
| V2 | rendez-vous, statut administratif | identité adaptée + confirmation |
| V3 | changement opérationnel/compte | step-up selon politique |
| V4 | données réglementées/sensibles | authentification renforcée + contrôle humain selon cas |
| V5 | finance, crédit, privilège | authentification cryptographique/step-up + approbation humaine selon politique |

Les niveaux sont attachés à l'action et voyagent avec elle entre agents/outils.

## 10. Voice Security Mesh

```
VOICE SECURITY MESH
 ├─ Channel Integrity
 ├─ Caller Trust
 ├─ Session Isolation
 ├─ Capability Lease
 ├─ Anti-Replay
 ├─ Fraud Signals
 ├─ Prompt Injection Firewall
 ├─ Tool Capability Firewall
 ├─ PII/Secret Firewall
 ├─ Transaction Signing
 ├─ Consent/Privacy
 ├─ Human Handoff
 ├─ Provenance
 ├─ Rate Limits
 ├─ Audit
 └─ Kill Switch
```

Le deepfake detector est un signal secondaire. Il ne remplace pas l'authentification, l'approbation, la séparation des tâches ou la signature de transaction.

## 11. Authentification

Ne jamais utiliser la voix seule comme authentificateur d'une opération critique.

Pour les opérations sensibles, utiliser selon le niveau :
- session d'appareil liée au compte ;
- passkey/WebAuthn ;
- confirmation push ;
- OTP/TOTP lorsque la politique l'autorise ;
- signature cryptographique d'action ;
- approbation humaine séparée.

Le challenge transactionnel doit lier au minimum organisation, session, action, outil, cible, paramètres normalisés, nonce/identifiant et expiration. Toute modification de montant, bénéficiaire, cible ou paramètre invalide le challenge.

## 12. Anti-rejeu / anti-usurpation

Contrôles :
- sessions courtes ;
- capability lease par appel ;
- identifiant d'action unique ;
- expiration ;
- replay barrier persistante ;
- signature des webhooks ;
- TLS/SRTP côté transport lorsque supporté ;
- vérification d'intégrité ;
- signaux de fraude ;
- step-up hors canal vocal pour les actions critiques.

Le numéro appelant peut alimenter le scoring mais ne doit jamais accorder un privilège.

## 13. Injection vocale

La parole et sa transcription sont des entrées non fiables.

Une phrase telle que « ignore tes règles » ne peut :
- modifier une policy ;
- donner un rôle ;
- élargir un outil ;
- changer le tenant ;
- transformer une donnée récupérée en instruction système.

Les résultats externes sont traités comme données. Les arguments d'outils sont validés indépendamment du texte vocal. La découverte d'un outil n'est jamais une autorisation.

## 14. Handoff humain

Le transfert doit :
- geler les actions sensibles ;
- révoquer les capacités IA de contrôle ;
- transmettre un résumé minimal ;
- conserver l'identité de l'agent ;
- indiquer les actions effectuées/non effectuées ;
- permettre la reprise humaine ;
- journaliser le transfert.

## 15. Audio et transcription

Séparer :
- audio brut ;
- transcription ;
- index de recherche ;
- événements d'audit.

Respecter :
- consentement ;
- finalité ;
- minimisation ;
- chiffrement ;
- rétention par organisation ;
- legal hold ;
- suppression contrôlée ;
- redaction PII/secrets ;
- catégories sans enregistrement lorsque requis.

Ne jamais mettre OTP, secret, clé API ou identifiant complet dans une réponse TTS.

## 16. Multilingue et contexte Togo/Afrique

Prévoir :
- français ;
- anglais ;
- langues locales activées seulement après validation réelle de la qualité ASR/TTS ;
- code-switching ;
- noms propres ;
- numéros ;
- montants XOF ;
- dates locales ;
- DTMF de secours.

Pour les montants, numéros et dates : lecture de confirmation structurée. Le système ne doit jamais deviner un chiffre mal reconnu.

## 17. Usages par organisation

- École : admission, absence, rendez-vous parent-direction, informations scolaires, rappels ; modification de notes interdite par simple appel.
- Université : admission, orientation, rendez-vous, suivi de dossier.
- Microfinance : collecte, rappel, rendez-vous, statut de dossier, préqualification ; décaissement/crédit final non vocal-only.
- Entreprise/PME/PMI : accueil, CRM, prospects, support, rendez-vous, RH, logistique.
- Restaurant : réservation, disponibilité, commande, livraison, réclamation.
- Hôtel : réservation, accueil, services, housekeeping.
- Boutique/supermarché : stock, commande, support.
- Clinique/hôpital : rendez-vous, administratif, orientation ; décisions cliniques à fort impact hors autonomie vocale.
- Pharmacie/laboratoire : rendez-vous, disponibilité/retrait, routage documentaire ; prescription selon workflow légal.
- ONG/association : bénéficiaires, rendez-vous, routage.
- Administration publique : information et rendez-vous ; données privées après vérification.
- Transport : réservation, ETA, support, incident.
- Ferme/agriculture : coordination, fournisseurs, livraisons, alertes.
- Immobilier : demandes, visites, rendez-vous.
- Média/culture/sport : réservation, billetterie, accueil.
- Startup : CRM, support, planning.
- Autre : Voice Skill Pack configurable.

## 18. Machine d'état

`RINGING → ACCEPTED → CONSENT_CHECK → IDENTIFICATION → TRUST_SCORING → INTENT_CAPTURE → POLICY_CHECK → TOOL_PLAN → USER_CONFIRMATION → EXECUTION → RESULT_CONFIRMATION → HANDOFF/ENDED`

Pour une action sensible :

`POLICY_CHECK → STEP_UP_AUTH → HUMAN_APPROVAL → EXECUTION`

Pour une anomalie :

`TRUST_SCORING/POLICY_CHECK → RESTRICTED ou CONTAINED → HANDOFF/ENDED`

## 19. Modèle de données cible

- voice_org_configs
- voice_numbers
- voice_departments
- voice_agents
- voice_agent_versions
- voice_sessions
- voice_calls
- voice_participants
- voice_consents
- voice_identities
- voice_trust_assessments
- voice_intents
- voice_entities
- voice_tool_calls
- voice_capability_leases
- voice_approvals
- voice_handoffs
- voice_recordings
- voice_transcripts
- voice_redactions
- voice_appointments
- voice_calendar_resources
- voice_call_queues
- voice_campaigns
- voice_optouts
- voice_call_outcomes
- voice_risk_events
- voice_security_events
- voice_fraud_signals
- voice_incidents
- voice_policies
- voice_prompts
- voice_prompt_versions
- voice_pronunciation_lexicons
- voice_sla_metrics
- voice_quality_metrics
- voice_audit_events

Toutes les tables tenantisées portent organization_id et les contraintes nécessaires. Les rendez-vous de production doivent disposer d'une barrière de concurrence côté PostgreSQL.

## 20. API cible

- POST /voice/sessions
- POST /voice/calls/inbound
- POST /voice/calls/outbound
- POST /voice/calls/{id}/handoff
- POST /voice/calls/{id}/verify
- POST /voice/calls/{id}/confirm
- POST /voice/calls/{id}/terminate
- GET /voice/calls/{id}
- POST /voice/appointments/search
- POST /voice/appointments/book
- POST /voice/appointments/reschedule
- POST /voice/appointments/cancel
- POST /voice/consents
- POST /voice/identity/challenge
- POST /voice/transactions/challenge
- POST /voice/security/events
- GET /voice/analytics

Ces routes sont des contrats : elles doivent passer par API Gateway, authz, idempotence et audit avant implémentation HTTP.

## 21. Événements

- voice.call.started
- voice.call.connected
- voice.consent.requested/granted/denied
- voice.identity.challenge/verified/failed
- voice.risk.increased
- voice.intent.detected
- voice.tool.requested/blocked
- voice.approval.requested/granted
- voice.action.executed/failed
- voice.handoff.started
- voice.recording.started/stopped
- voice.transcript.redacted
- voice.fraud.detected
- voice.prompt_injection.detected
- voice.call.ended
- voice.incident.created

Les événements ne sont pas des preuves financières. Les changements d'état financiers restent ceux du Financial Core.

## 22. Technologie cible 2026–2030

- TypeScript/Node.js pour les contrats et services T.Pay ;
- PostgreSQL pour l'état transactionnel ;
- Redis pour états éphémères/rate limits lorsque approprié ;
- OpenTelemetry pour traces/métriques ;
- NATS/Redpanda/Kafka à l'échelle événementielle ;
- Temporal ou moteur durable équivalent pour appels longs ;
- WebRTC/WebSocket pour temps réel web/app ;
- SIP/PSTN via opérateur/agrégateur ;
- OpenAI Realtime/Voice ou autre fournisseur via adapter ;
- HSM/KMS/secrets vault ;
- passkeys/WebAuthn ;
- stockage objet chiffré pour médias ;
- recherche séparée avec ACL pour transcriptions ;
- policy engine indépendant du modèle.

Le fournisseur vocal est remplaçable. Le modèle n'est jamais le composant d'autorisation.

## 23. Sécurité 2026–2030

Préparer progressivement :
- Zero Trust ;
- mTLS entre services ;
- short-lived credentials ;
- capability leases ;
- signatures webhook ;
- isolation par tenant ;
- protection supply-chain et SBOM ;
- attestation d'appareil lorsque disponible ;
- confidential computing lorsque le coût et la maturité le justifient ;
- simulation continue des politiques ;
- tests adversariaux vocaux ;
- migration post-quantique lorsque les algorithmes/standards nécessaires sont standardisés et production-ready.

## 24. Tests d'acceptation obligatoires

### Sécurité
- caller ID ne donne aucun privilège ;
- tenant A ne lit ni ne modifie tenant B ;
- capability expirée refusée ;
- session expirée refusée ;
- replay d'action refusé ;
- challenge modifié refusé ;
- approbation d'une autre action refusée ;
- action financière sans signature refusée ;
- action financière sans approbation requise refusée ;
- injection dans transcription ne change pas la policy ;
- outil non autorisé refusé ;
- handoff révoque les capacités IA.

### Rendez-vous
- conflit détecté ;
- annulation libère le créneau ;
- annulation inter-tenant refusée ;
- intervalle invalide refusé ;
- récurrence et fuseau traités par le service de calendrier de production ;
- réservation idempotente côté persistance.

### Résilience
- fournisseur vocal indisponible → mode dégradé/handoff ;
- outil indisponible → aucune mutation partielle ;
- timeout → état récupérable ;
- reprise d'appel → capacité régénérée, jamais réutilisée aveuglément.

## 25. KPIs

- p50/p95 de latence de réponse ;
- taux de résolution au premier appel ;
- réussite de réservation ;
- taux de transfert humain ;
- précision des montants/dates/noms ;
- taux de blocage des actions sensibles ;
- faux positifs/faux négatifs du scoring de risque ;
- incidents de replay ;
- tentatives d'escalade de privilège ;
- fuite PII dans transcription ;
- taux de consentement valide ;
- coût par minute/appel ;
- coût modèle ;
- disponibilité ;
- MTTR ;
- qualité par langue.

## 26. Déploiement progressif

Phase 0 : contrats + policy + tests.
Phase 1 : sessions et Voice Gateway.
Phase 2 : réception + rendez-vous.
Phase 3 : CRM et organisation.
Phase 4 : handoff.
Phase 5 : Voice Security Mesh.
Phase 6 : step-up + signature d'action.
Phase 7 : vault audio/transcription.
Phase 8 : appels sortants contrôlés.
Phase 9 : packs par secteur.
Phase 10 : red team/certification.
Phase 11 : haute disponibilité/multi-région.
Phase 12 : opérations proactives bornées.

## 27. Règles non négociables

1. Une voix n'est pas une autorisation.
2. Caller ID n'est pas une identité.
3. Voiceprint n'est pas un facteur suffisant pour une action critique.
4. Le modèle ne modifie jamais directement la base.
5. Le modèle ne valide jamais seul une opération financière.
6. Les capabilities ne survivent pas à la session.
7. Les données externes ne deviennent jamais des instructions système.
8. L'IA ne contourne jamais Security, Policy ou Financial Core.
9. Le deepfake detector n'est jamais le contrôle unique.
10. Les secrets ne sont jamais prononcés ni enregistrés.
11. Une action sensible doit être liée à l'action exacte et à une preuve d'autorisation fraîche.
12. Toute défaillance d'autorisation, de policy ou d'audit est fail-closed.

## 28. Critère de complétude du Prompt 020

Le bloc est considéré implémenté seulement lorsque :
- contrats TypeScript et machine d'état sont testés ;
- scheduler dispose d'une implémentation transactionnelle PostgreSQL ;
- API Gateway expose les routes avec authz/idempotence ;
- provider vocal est derrière adapter ;
- callbacks téléphoniques sont authentifiés ;
- Voice Security Mesh est observable ;
- les scénarios adversariaux sont dans la suite de régression ;
- CI est verte sur le commit exact ;
- rollback/migration est documenté pour tout état persistant ;
- aucune règle critique ne dépend d'une sortie libre du modèle.

## 29. Architecture finale

`PSTN/SIP/WebRTC/Mobile/Web → Voice Gateway → Session/Consent → Trust/Risk → Intent → AI Core → Policy/Capability → Approval → Tool Gateway → Domain Service → Audit/Events`

Le Financial Core, Identity, Security, Knowledge, Memory, Evaluation et Agent Runtime restent des autorités indépendantes. Voice Fabric les orchestre comme interface, sans créer de doublon.
