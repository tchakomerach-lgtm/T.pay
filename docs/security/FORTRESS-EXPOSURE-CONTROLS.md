# T.Pay Fortress — exposition des données sensibles

## Contrôle FORT-EXPO-001 — Guard central

`packages/security/src/fortress-exposure-guard.ts` fournit un filtre défensif pour les chaînes et objets qui traversent une frontière de confiance. Il masque les clés sensibles reconnues, les e-mails, les téléphones, certains identifiants de paiement, des identifiants de passeport et plusieurs formats courants de jetons.

Le guard borne aussi la profondeur récursive et la taille d'entrée, rejette les objets non sérialisables, et crée les propriétés de sortie sans permettre à une clé `__proto__` de modifier le prototype. Ces contrôles réduisent les risques de déni de service et de pollution de prototype; ils ne remplacent pas une validation de schéma à l'entrée.

Les identifiants UUID opaques sont préservés par les motifs de téléphone/carte afin de conserver la corrélation distribuée; les tests couvrent ce cas. Le filtrage par motif est une défense en profondeur, pas un moteur DLP exhaustif. Les schémas métier et les autorisations par tenant restent la source de vérité.

## Contrôle FORT-EXPO-002 — Erreurs HTTP

`normalizeApiError()` n'autorise que des codes d'erreur publics explicitement listés. Tout code interne inconnu devient `API_INTERNAL_ERROR`. L'identifiant de corrélation est validé et expurgé s'il ressemble à une donnée personnelle ou à un secret. Le gestionnaire HTTP renvoie le statut normalisé plutôt que d'exposer le message d'exception.

## Contrôle FORT-EXPO-003 — Sorties IA

Les chemins `AiCore.generate()` et `AiCore.generateRouted()` font passer le texte de sortie des fournisseurs par le guard avant de le rendre à l'appelant. Les réponses sont limitées à 1 000 000 octets après expurgation. Les données de contexte avant envoi aux fournisseurs, les journaux généraux, les exports et les notifications nécessitent encore des contrôles dédiés.

## Contrôle FORT-EXPO-004 — Tests de régression

Les tests vérifient :
- les codes d'erreur internes remplacés par un code générique ;
- la non-réflexion des e-mails, téléphones et chaînes de type Bearer ;
- l'expurgation des données sensibles dans les sorties IA directes et routées ;
- le maintien de codes publics documentés ;
- la résistance aux clés `__proto__`, à la profondeur excessive et aux entrées trop volumineuses.

## Gates de certification

Aucune certification n'est implicite dans la présence de ces fichiers. La CI sur le SHA exact doit réussir. Les chemins de logs, traces, métriques, exports documentaires, notifications, prompts/RAG et adaptateurs fournisseurs doivent être examinés séparément. HSM/KMS réel, tests PostgreSQL concurrents et exercices red-team restent des contrôles distincts.


## Contrôles FORT-EXPO-005 à FORT-EXPO-009 — Frontières supplémentaires

- **Entrées IA / prompts / RAG (005)** : `AiCore.generate()`, `generateRouted()` et `run()` expurgent les messages et objectifs avant leur transmission aux agents/fournisseurs. `HttpJsonAiProvider` applique aussi ces contrôles si un appelant utilise directement l'adaptateur. Les en-têtes d'authentification ne peuvent pas être remplacés par `extraHeaders`; les réponses fournisseur sont limitées en taille et les redirections refusées. Les sorties d'agents, le texte et les métadonnées de réponse sont également filtrés. Le contrôle ne remplace ni les règles d'autorisation de récupération RAG ni la politique de résidence/consentement des données.
- **Logs et traces (006)** : `sanitizeTelemetry()` expurge récursivement les valeurs, `sanitizeTelemetryContext()` n'accepte que des identifiants opaques pour les étiquettes de trace, et `emitSafeTelemetry()` n'envoie au sink que l'enregistrement assaini. Les nouveaux call sites doivent passer par ces frontières; il ne faut jamais journaliser directement des corps HTTP, prompts complets, secrets ou réponses de fournisseur.
- **Exports (007)** : `prepareFortressExport()` exige des identifiants opaques d'acteur et d'organisation, un motif d'export, une limite de taille, puis renvoie un payload expurgé et un résumé d'audit avec empreinte SHA-256. L'autorisation d'accès et l'enregistrement d'audit durable restent obligatoires chez l'appelant.
- **Notifications (008)** : les intents sont expurgés et leurs identifiants de destinataire/organisation doivent être opaques à la création et à la livraison. Les notifications utilisent des modèles et ne doivent pas transporter montant, solde, OTP ou secrets de paiement.
- **Adaptateurs fournisseurs (009)** : HTTPS et absence de redirection restent obligatoires. Les requêtes/réponses sont limitées en taille, les en-têtes CR/LF sont refusés, les identifiants de corrélation sont expurgés et les corps de réponse trop volumineux échouent en état inconnu sans être renvoyés. Les corps financiers légitimes ne sont pas modifiés en transit, car cela invaliderait les signatures et les transactions; ils doivent rester dans le chemin métier autorisé et ne jamais être journalisés.

## Diagnostics CI

Les workflows CI et Android commencent par une étape de diagnostic du runner, enregistrent les sorties de chaque gate séparément et téléversent seulement les journaux expurgés pour une rétention de sept jours. Les gates `npm run check`, `npm run security:fortress`, `npm run web:build` et `npm audit` continuent indépendamment après un échec, dès lors que l'installation des dépendances a réussi.

## Limites et gates restantes

La disponibilité d'un runner GitHub hébergé dépend des paramètres/quotas de l'espace de dépôt et du service Actions; un commit de code ne peut pas réparer à lui seul une désactivation de compte ou une limite de facturation. Un job dont `runner_id=0` et dont `steps=[]` échoue avant l'exécution : aucune conclusion sur TypeScript ou les tests n'est possible. La CI doit produire un runner assigné, des étapes et un artefact de diagnostics expurgé avant de corriger les erreurs de compilation/test découvertes.

Les tests PostgreSQL de concurrence, la validation d'un HSM/KMS réel, les exercices red-team et la certification terrain Android/HTTPS restent des gates séparées. Aucun de ces contrôles n'est réputé réussi sur la seule base d'une modification de code.
